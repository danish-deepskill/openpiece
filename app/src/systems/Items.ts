import { equipItem, equippedIn, unequipToBag } from '../combat/equip';
import { HOLD_REACH, PICKUP_R } from '../config/constants';
import { countedName, isEquippable, isItemRef, itemName, sameItem, stackLimitOf, type ItemRef } from '../defs/items';
import type { Entity } from '../ecs/components';
import type { Spawner } from '../ecs/Spawner';
import type { World } from '../ecs/World';
import type { SpatialQuery } from '../world/SpatialQuery';
import type { Collision } from '../world/Collision';
import { deckCellAtLocal, deckOf } from '../defs/decks';
import { ShipHulls } from '../defs/ships';

/** A PLAYER INTENT about items — what the inventory panel SENDS (never a mutation): InputSystem queues it and
 *  applies it inside the sim tick through this service for the CONTROLLED entity, re-validating everything at
 *  apply time (reachability, counts, categories). The multiplayer stance rehearsed locally: the client names an
 *  intent, the authority resolves it against what is actually there (ITEMS.md §4). `hold` ids name containers. */
export type ItemIntent =
  | { kind: 'move'; from: number; to: number; ref: ItemRef; n: number }
  | { kind: 'drop'; ref: ItemRef; n: number }
  | { kind: 'equip'; ref: ItemRef }
  | { kind: 'unequip'; ref: ItemRef }
  | { kind: 'split'; hold: number; index: number; n: number };

/**
 * THE single mutation site for item quantities (ITEMS.md §4 — the dupe defense), in the `Damage` pattern: a
 * sim service, Phaser-free, injected (WorldScene → the verb context + InputSystem), never stepped. Every give,
 * take, move, split, drop, equip-from-hold runs here, synchronously inside one sim tick, so a transfer can
 * never be half-done across frames — the research's one root cause of dupes, made structurally impossible.
 *
 * The rules live HERE and nowhere else:
 *  - stacks MERGE iff the same {cat, id}; a stack never exceeds its def's `stackLimit`; excess opens another
 *    stack while a SLOT is free — `Hold.slots` counts stacks, so capacity × stackLimit is the volume
 *  - counts are integers ≥ 1: a zero stack is REMOVED, never kept; a bad request (NaN / ≤ 0) moves nothing
 *  - a stack found ABOVE its limit is corrupt data (a hand-edited save, a def whose limit was lowered): it is
 *    clamped and WARNED loudly ("truncating"), never silently obeyed — the design's "clamp + log loud" rule
 *  - a two-container move is ATOMIC: sized by BOTH ends first, then executed, so it can never take without
 *    giving (the classic dupe/loss pair)
 * Return values are the contract callers act on: `give` reports what FIT, `take` what was removed, `move` what
 * crossed. `version` bumps on every successful mutation — the presentation's cheap "did anything change" key.
 * Any actor is a valid party (the Moat): a looter, a quartermaster, and the player all call the same verbs.
 */
export class Items {
  /** Bumped on every successful mutation — the panel re-renders on a change of this, not per frame. */
  version = 0;

  constructor(
    private readonly world: World,
    private readonly spawner: Spawner,
    private readonly query: SpatialQuery,
    /** The world's solid/water oracle for `drop` (a pile must land on open floor). Defaulted so headless tests
     *  without a grid stand (the systems' `query` precedent); the scene always passes the real one. */
    private readonly collision?: Collision,
  ) {}

  /** Stow `n` of `ref` into the holder's hold: fill matching stacks to their limit first, then open new stacks
   *  while a slot is free. Copies the ref (value semantics — the caller's object is never aliased in). Returns
   *  how many were stowed (0 for a bad request or a holder with no hold). */
  give(e: Entity, ref: ItemRef, n: number): number {
    const want = whole(n);
    const hold = e.hold;
    if (want <= 0 || !hold) return 0;
    const limit = stackLimitOf(ref);
    let left = want;
    for (const s of hold.stacks) {
      if (left === 0) break;
      if (!sameItem(s.ref, ref)) continue;
      this.repair(s.ref, s, limit);
      const add = Math.min(limit - s.n, left);
      if (add <= 0) continue; // this stack is full — the next matching one, or a new one, takes the rest
      s.n += add;
      left -= add;
    }
    while (left > 0 && hold.stacks.length < hold.slots) {
      const add = Math.min(limit, left);
      hold.stacks.push({ ref: { cat: ref.cat, id: ref.id }, n: add }); // a COPY: the pickup/def ref is never shared
      left -= add;
    }
    if (left !== want) this.version++;
    return want - left;
  }

  /** Remove up to `n` of `ref` (newest stacks first, so a partial stack drains before a full one). Returns what
   *  was actually removed — never more than was there, never negative. Empty stacks are dropped. */
  take(e: Entity, ref: ItemRef, n: number): number {
    const want = whole(n);
    const hold = e.hold;
    if (want <= 0 || !hold) return 0;
    const limit = stackLimitOf(ref);
    let left = want;
    for (let i = hold.stacks.length - 1; i >= 0 && left > 0; i--) {
      const s = hold.stacks[i]!; // index proven by the loop bounds
      if (!sameItem(s.ref, ref)) continue;
      this.repair(s.ref, s, limit);
      const sub = Math.min(s.n, left);
      s.n -= sub;
      left -= sub;
      if (s.n === 0) hold.stacks.splice(i, 1); // never keep a zero stack (a phantom "Powder ×0" is a bug)
    }
    if (left !== want) this.version++;
    return want - left;
  }

  /** Total units of `ref` in the hold across all its stacks. */
  count(e: Entity, ref: ItemRef): number {
    let total = 0;
    for (const s of e.hold?.stacks ?? []) if (sameItem(s.ref, ref)) total += s.n;
    return total;
  }

  /** How many MORE units of `ref` this hold can take right now: the headroom in matching stacks plus every free
   *  slot at a full stack each. The pre-check `move` and the equip swap size themselves by. */
  room(e: Entity, ref: ItemRef): number {
    const hold = e.hold;
    if (!hold) return 0;
    const limit = stackLimitOf(ref);
    let free = Math.max(0, hold.slots - hold.stacks.length) * limit;
    for (const s of hold.stacks) if (sameItem(s.ref, ref)) free += Math.max(0, limit - s.n);
    return free;
  }

  /** Move up to `n` of `ref` between two holds ATOMICALLY: sized by what the source has AND what the
   *  destination can take, then take + give — never one without the other. Returns what crossed. */
  move(from: Entity, to: Entity, ref: ItemRef, n: number): number {
    if (from === to) return 0;
    const amt = Math.min(whole(n), this.count(from, ref), this.room(to, ref));
    if (amt <= 0) return 0;
    const took = this.take(from, ref, amt);
    const gave = this.give(to, ref, took);
    if (gave !== took) this.give(from, ref, took - gave); // unreachable by construction (room was checked); the guard keeps the count conserved if it ever isn't
    return gave;
  }

  /** Carve `n` units off the stack at `index` into a NEW stack in the same hold (needs a free slot). The panel's
   *  "split" — a stack of 40 becomes 20 + 20. Returns what was split off (0 if no slot, bad index, or n ≥ the
   *  stack — splitting a whole stack is a no-op, not a move). */
  split(e: Entity, index: number, n: number): number {
    const hold = e.hold;
    const s = hold?.stacks[index];
    const want = whole(n);
    if (!hold || !s) return 0;
    this.repair(s.ref, s, stackLimitOf(s.ref)); // a corrupt over-limit stack must not split into TWO corrupt ones
    if (want <= 0 || want >= s.n || hold.stacks.length >= hold.slots) return 0;
    s.n -= want;
    hold.stacks.push({ ref: { cat: s.ref.cat, id: s.ref.id }, n: want });
    this.version++;
    return want;
  }

  /** Drop up to `n` of `ref` from the actor's hold as ONE pile (a Pickup with a count), set down a clear
   *  body-width AHEAD so it never overlaps the dropper — unless that spot is solid or water (facing a wall, the
   *  quay's edge), in which case it lands at the feet, which are open floor by definition. Refused aboard a
   *  ship: a world-frame pickup on a moving deck would be the treadmill bug (MOVEMENT FRAMES canon) — stow it in
   *  the hold instead. Returns what was dropped. */
  drop(e: Entity, ref: ItemRef, n: number): number {
    const t = e.transform;
    if (!t || e.onDeck) return 0;
    const dropped = this.take(e, ref, n);
    if (dropped <= 0) return 0;
    const d = t.r + PICKUP_R + DROP_GAP; // both radii + a gap: the sprites don't touch
    const ax = t.x + Math.cos(t.angle) * d;
    const ay = t.y + Math.sin(t.angle) * d;
    const clear = !this.collision || this.collision.canOccupy(ax, ay, PICKUP_R, 'foot');
    this.spawner.spawnPickup(ref, clear ? ax : t.x, clear ? ay : t.y, dropped);
    return dropped;
  }

  /** Wear one unit of an equippable from the hold. The displaced occupant of that slot (if any) goes back into
   *  the hold — and the swap is refused whole if it would not fit (nothing is taken, nothing is lost). */
  equipFromHold(e: Entity, ref: ItemRef): boolean {
    if (!isEquippable(ref) || this.take(e, ref, 1) !== 1) return false;
    const displaced = equippedIn(e, ref);
    if (displaced && this.room(e, displaced) < 1) {
      this.give(e, ref, 1); // undo: no slot for the swap-out, so the swap doesn't happen
      return false;
    }
    unequipToBag(e, ref);
    if (displaced) this.give(e, displaced, 1);
    equipItem(e, ref);
    this.version++;
    return true;
  }

  /** Take off whatever occupies the slot `ref` targets and stow it in the hold (refused if no slot is free). */
  unequipToHold(e: Entity, ref: ItemRef): boolean {
    const worn = equippedIn(e, ref);
    if (!worn || this.room(e, worn) < 1) return false;
    unequipToBag(e, ref);
    this.give(e, worn, 1);
    this.version++;
    return true;
  }

  /** Take a ground PILE (a Pickup with a count) into the actor's hold: stow what fits, shrink the pile by that,
   *  relabel it, destroy it when empty. The ONE path from ground to hold for commons — the take verb and any
   *  future looter brain call this, never the give/decrement/relabel/destroy quartet by hand. Returns stowed. */
  takeFromPile(actor: Entity, pile: Entity): number {
    const pk = pile.pickup;
    if (!pk) return 0;
    const stowed = this.give(actor, pk.item, pk.n);
    pk.n -= stowed;
    if (pk.n <= 0) this.world.destroy(pile); // RenderSystem's orphan sweep destroys the gfx
    else pk.label = countedName(pk.item, pk.n); // a partial take leaves a smaller, honestly labelled pile
    return stowed;
  }

  /** Resolve a PLAYER INTENT for `actor` — the seam's AUTHORITY: every field re-validated against the world NOW
   *  (the panel's view may be a frame stale, a chest may have walked out of reach, a net client could lie). A
   *  hold must be the actor's own or the ONE reachable container; refs must resolve; counts are clamped by the
   *  verbs. Returns null on success, else the REASON it was refused — the caller surfaces it as a notice, so a
   *  refusal is never a silent no-op. Lives here (not in InputSystem) so the contracts are testable headless. */
  apply(actor: Entity, it: ItemIntent): string | null {
    if ('ref' in it && !isItemRef(it.ref)) return 'Unknown item.'; // an unknown ref is refused, never guessed at
    const other = this.reachableHold(actor);
    const holdOf = (id: number): Entity | undefined => (id === actor.id ? actor : other && other.id === id ? other : undefined);
    switch (it.kind) {
      case 'move': {
        const from = holdOf(it.from);
        const to = holdOf(it.to);
        if (!from || !to) return 'Out of reach.';
        if (from === to) return null; // a same-hold "move" is a no-op, not an error
        if (this.count(from, it.ref) === 0) return `No ${itemName(it.ref)} there.`;
        return this.move(from, to, it.ref, it.n) > 0 ? null : `No room for ${itemName(it.ref)}.`;
      }
      case 'drop':
        if (actor.onDeck) return "Can't drop aboard — stow it in the hold.";
        if (this.count(actor, it.ref) === 0) return `No ${itemName(it.ref)} to drop.`;
        return this.drop(actor, it.ref, it.n) > 0 ? null : `Couldn't drop ${itemName(it.ref)}.`;
      case 'equip':
        if (!isEquippable(it.ref)) return `${itemName(it.ref)} can't be worn.`;
        if (this.count(actor, it.ref) === 0) return `No ${itemName(it.ref)} in the bag.`;
        return this.equipFromHold(actor, it.ref) ? null : `No room to swap out for ${itemName(it.ref)}.`;
      case 'unequip':
        if (!isEquippable(it.ref) || !equippedIn(actor, it.ref)) return 'Nothing worn there.';
        return this.unequipToHold(actor, it.ref) ? null : `Bag full — can't take off ${itemName(it.ref)}.`;
      case 'split': {
        const h = holdOf(it.hold);
        if (!h) return 'Out of reach.';
        return this.split(h, it.index, it.n) > 0 ? null : 'No free slot to split into.';
      }
    }
  }

  /** The ONE other container an actor can reach into right now, or undefined. Aboard: the ship's hold, but only
   *  while STANDING ON its hatch tile — the embodied rule (the wheel is the helm tile; the cargo is the hatch
   *  tile), never "anywhere on deck". Ashore: the nearest thing with a hold within arm's reach that is NOT a
   *  living body — a chest today, a corpse when bodies persist. A living unit's bag is theft (ITEMS.md slice 4),
   *  never a reach-in. Presentation asks this to decide what to show; `apply` asks it again at apply time (the
   *  authority never trusts what the panel displayed). */
  reachableHold(actor: Entity): Entity | undefined {
    if (actor.onDeck) {
      const ship = this.world.byId(actor.onDeck.shipId);
      if (!ship?.ship || !ship.hold) return undefined;
      const grid = deckOf(ship.ship.hull, ShipHulls.get(ship.ship.hull).deck);
      return deckCellAtLocal(grid, actor.onDeck.lx, actor.onDeck.ly)?.tile === 'hatch' ? ship : undefined;
    }
    const t = actor.transform;
    if (!t) return undefined;
    return this.query.nearest(t.x, t.y, t.r + HOLD_REACH, (o) => o !== actor && !!o.hold && !o.onDeck && (!o.health || o.health.dead));
  }

  /** The corrupt-stack guard: a count above the def's limit can only come from outside the service (a hand-
   *  edited save, a lowered def limit). Clamp it and say so — silently honoring it would be the wrap/overflow
   *  class the design forbids. Reached only by broken data, so the warning is a bug signal, not noise. */
  private repair(ref: ItemRef, s: { n: number }, limit: number): void {
    if (s.n > limit) {
      console.warn(`Items: truncating ${ref.cat} '${ref.id}' stack of ${s.n} to its stackLimit ${limit}`);
      s.n = limit;
    }
  }
}

/** Clearance (px) between the dropper's edge and a dropped pile's edge — a visible gap, still within take reach. */
const DROP_GAP = 10;

/** Whole units only; a non-finite request is nothing. */
const whole = (n: number): number => (Number.isFinite(n) ? Math.floor(n) : 0);
