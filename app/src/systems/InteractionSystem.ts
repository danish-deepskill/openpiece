import { equipItem, unequipToBag } from '../combat/equip';
import { events } from '../core/EventBus';
import { dist2 } from '../core/math';
import { countedName, isEquippable, itemName } from '../defs/items';
import { Manuals } from '../defs/manuals';
import { Structures } from '../defs/structures';
import { TILE } from '../config/constants';
import type { Entity } from '../ecs/components';
import type { Spawner } from '../ecs/Spawner';
import type { World } from '../ecs/World';
import type { DialogueSystem } from './DialogueSystem';
import type { Items } from './Items';

/** Services a verb's `run` may need to carry out its effect. */
export interface VerbCtx {
  world: World;
  dialogue: DialogueSystem;
  /** The single item-quantity mutation site — every stow/displace-to-bag goes through it (ITEMS.md §4). */
  items: Items;
  /** The one unit-spawn path (the Moat: a summoned duelist is born on the same stack as the hero) — `verb.summon`. */
  spawner: Spawner;
}

/**
 * One thing an actor can DO — to a nearby entity (`take`, `talk`, `open`, `harvest`) or to itself. Availability
 * is decided by `can()` querying the actor + target's COMPONENTS, so a verb applies to ANY entity that
 * qualifies — the Moat for interaction: no per-object code, no `if (name === …)`. A new interaction is a new
 * VerbDef, never a new branch in the input/scene code. (Ship boarding/leaving is NOT a verb — you walk the
 * gangplank; the wheel is E-on-helm in InputSystem.)
 */
export interface VerbDef {
  id: string;
  /** The on-screen prompt label, e.g. "Equip Cutlass" / "Talk to Maro". */
  label: (actor: Entity, target: Entity | undefined) => string;
  /** Extra reach (px) beyond the two body radii (target verbs). Default 24. */
  reach?: number;
  /** A self-verb acts on the actor with no nearby-target scan (e.g. disembark); offered first. */
  self?: boolean;
  can: (actor: Entity, target: Entity | undefined, ctx: VerbCtx) => boolean;
  run: (actor: Entity, target: Entity | undefined, ctx: VerbCtx) => void;
}

/**
 * Take any world item, dispatching on its KIND (a category rule, never a per-id branch): a manual is READ, an
 * equippable is WORN (a displaced occupant drops into the bag — a pickup always swaps you into the newer gear,
 * the "good UX" rule), and commons (materials) are STOWED as a counted stack. Every bag write goes through
 * `ctx.items` — the one mutation site.
 */
function takePickup(actor: Entity, target: Entity | undefined, ctx: VerbCtx): void {
  const pk = target!.pickup!;
  const ref = pk.item;
  // MANUAL (a skill book): READ it → grant the taught ability, then consume. NOT an equip (no slot, no displace,
  // no bag) — so it routes here BEFORE the equip path (which would throw on a manual's absent slot). The Moat:
  // any actor that reads it learns the technique; the grant lands in its loadout like any capability.
  if (ref.cat === 'manual') {
    const m = Manuals.get(ref.id);
    actor.loadout?.granted.add(m.teaches);
    events.emit('notify', { msg: `Learned ${m.name.replace(/ Manual$/, '')}!` });
    ctx.world.destroy(target!);
    return;
  }
  if (!isEquippable(ref)) {
    // COMMONS (a material pile): stow through the service — it merges into a matching stack and clamps per
    // stack. `give` returns what FIT; with no slot cap yet that is all of it, but the remainder-stays-on-the-
    // ground path below is the contract slice 3's capacity will exercise (a smaller, honestly labelled pile).
    const stowed = ctx.items.takeFromPile(actor, target!); // stow what fits; the pile shrinks, relabels, or vanishes INSIDE the service
    events.emit('notify', { msg: stowed > 0 ? `Took ${countedName(ref, stowed)}.` : `No room for ${itemName(ref)}.` });
    return;
  }
  const displaced = unequipToBag(actor, ref); // vacate the target slot; returns the old occupant (or undefined)
  if (displaced) ctx.items.give(actor, displaced, 1); // the swapped-out item drops into the bag as a stack of 1
  equipItem(actor, ref); // wear the new one (equip's own displace path sees an already-empty slot now)
  const eaten = ref.cat === 'fruit';
  events.emit('notify', { msg: `${eaten ? 'Ate the' : 'Equipped'} ${itemName(ref)}${eaten ? '!' : '.'}` });
  if (displaced) events.emit('notify', { msg: `${itemName(displaced)} → bag.` });
  ctx.world.destroy(target!); // RenderSystem's orphan sweep destroys the gfx
}

/** The base verb set. Content/systems append more (talk, open, harvest, sit, read) — each is one entry.
 *  NOTE: boarding/leaving a ship is NOT a verb — you WALK across the gangplank (HullCollisionSystem does the
 *  world↔deck frame handoff), and take/release the wheel with E on the helm (InputSystem). */
export const Verbs: VerbDef[] = [
  {
    id: 'verb.take',
    reach: 20,
    label: (_a, t) => {
      const cat = t!.pickup!.item.cat;
      return `${cat === 'fruit' ? 'Eat' : cat === 'manual' ? 'Read' : 'Take'} ${t!.pickup!.label}`; // the label carries the count ("Powder ×20")
    },
    can: (a, t) => !a.onDeck && !!t?.pickup,
    run: takePickup,
  },
  {
    // WARP — a waystone: step to its pair's arrival point. The destination is on the INSTANCE (structure.warp — worldgen
    // links pairs), so the verb is one rule for every stone. Velocities and any carry are dropped (you arrive standing);
    // the drawn pose and camera re-acquire the body on their own (ViewPose snaps a jump past VIEW_TELEPORT_PX).
    id: 'verb.warp',
    reach: 28,
    label: () => 'Use Waystone',
    can: (a, t) => !a.onDeck && !!t?.structure?.warp && !!a.transform,
    run: (a, t) => {
      const w = t!.structure!.warp!;
      a.transform!.x = w.x;
      a.transform!.y = w.y;
      const m = a.mover;
      if (m) {
        m.vx = 0; m.vy = 0; m.dvx = 0; m.dvy = 0; m.dodgeT = 0;
      }
      if (a.ai?.bb) a.ai.bb.path = null; // a planned route to the old place is nonsense now
      events.emit('notify', { msg: 'Warped.' });
    },
  },
  {
    // SUMMON — a summoner structure (the duel gong, the training post): the DEF names a roster (`summon`: unit + tile offset); using it
    // spawns them through the one spawn path, each facing the others' centroid (two → face to face), and records their
    // ids on the INSTANCE (`structure.summoned`) so a second ring is refused while any of them lives — no stacking a
    // duel on a duel. Dead or despawned → ring again: the set-piece is re-runnable, and it starts when someone is
    // there to watch it (the alternative, a unit asleep until approached, put the trigger on the unit and ran a world
    // scan per sleeper per tick — this is one press, one spawn).
    id: 'verb.summon',
    reach: 28,
    label: (_a, t) => {
      const def = Structures.get(t!.structure!.def); // can() admitted a summoner
      return def.reRing === 'clear' && t!.structure!.summoned?.length ? `Clear the ${def.name.toLowerCase()}` : def.summonLabel ?? `Use ${def.name}`;
    },
    can: (a, t) => !a.onDeck && !!t?.structure && Structures.get(t.structure.def).summon !== undefined && !!a.transform,
    run: (_a, t, ctx) => {
      const st = t!.structure!; // can() admitted a summoner
      const def = Structures.get(st.def);
      const living = (st.summoned ?? []).map((id) => ctx.world.byId(id)).filter((u): u is Entity => !!u?.health && !u.health.dead);
      if (living.length > 0) {
        const mode = def.reRing ?? 'refuse';
        if (living.includes(_a)) {
          events.emit('notify', { msg: 'You are in it.' }); // a possessed duelist can't clear or reset the roster it belongs to — that would destroy its own body
          return;
        }
        if (mode === 'refuse') {
          events.emit('notify', { msg: 'The duel is still on.' });
          return;
        }
        for (const u of living) ctx.world.destroy(u); // 'clear' and 'reset' both remove the live roster…
        st.summoned = [];
        if (mode === 'clear') {
          events.emit('notify', { msg: 'Cleared.' });
          return;
        }
        // …and 'reset' falls through to summon a fresh one from the marks (the gong rung mid-duel restarts it)
      }
      const roster = Structures.get(st.def).summon!; // `!` safe: can() admitted only a def that carries one
      const spots = roster.map((r) => ({ x: (st.tx + r.dx + 0.5) * TILE, y: (st.ty + r.dy + 0.5) * TILE }));
      st.summoned = roster.map((r, i) => {
        const e = ctx.spawner.spawnUnit(r.unit, spots[i]!.x, spots[i]!.y); // `!` safe: spots is roster's map
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (let j = 0; j < spots.length; j++) {
          if (j === i) continue;
          sx += spots[j]!.x; // `!` safe: j indexes spots
          sy += spots[j]!.y;
          n++;
        }
        if (n > 0 && e.transform) e.transform.angle = Math.atan2(sy / n - spots[i]!.y, sx / n - spots[i]!.x); // face the others
        return e.id;
      });
      events.emit('notify', { msg: def.reRing === 'clear' ? 'Set.' : 'The gong rings.' });
    },
  },
  {
    id: 'verb.talk',
    reach: 24,
    label: (_a, t) => `Talk to ${t!.identity?.name ?? 'someone'}`,
    can: (a, t) => !a.onDeck && !!t?.npc,
    run: (a, t, ctx) => {
      const npc = t!.npc!;
      const name = t!.identity?.name ?? 'Someone';
      // a recruitable NPC ends its lines with a yes/no; Y brings it into your crew (see recruit)
      const choice = npc.recruitable ? `Recruit ${name}?  [Y] Yes   [N] No` : undefined;
      ctx.dialogue.open(
        name,
        npc.dialogue,
        t!.render?.baseColor ?? 0xe0a070,
        t!.render?.hatColor ?? 0x888888,
        choice,
        choice ? (yes) => { if (yes) recruit(a, t!); } : undefined,
      );
    },
  },
];

/** Bring `target` into the actor's crew: switch it to the actor's faction (the matrix makes it an ally, so it
 *  stops fighting you and defends you) and set it to FOLLOW the actor (its AI home tracks the leader — brains.
 *  syncFollow). Clears `recruitable` so it can't be recruited again. Simple crew: no roster/limit yet. */
export function recruit(actor: Entity, target: Entity): void {
  if (actor.faction) target.faction = { id: actor.faction.id };
  if (target.ai) target.ai.bb.followId = actor.id;
  if (target.npc) target.npc.recruitable = false;
  events.emit('notify', { msg: `${target.identity?.name ?? 'They'} joined your crew!` });
}

/**
 * Resolves "what can I interact with right now?" for an actor — the single source of truth for BOTH the HUD
 * prompt and the E-press, so they can never disagree. Self-verbs win; otherwise the nearest entity offering an
 * available verb. O(N) scan today (small N); sits behind the same seam as SpatialQuery to swap for a grid at scale.
 */
export class InteractionSystem {
  private readonly ctx: VerbCtx;
  constructor(
    private readonly world: World,
    dialogue: DialogueSystem,
    items: Items,
    spawner: Spawner,
    private readonly verbs: VerbDef[] = [...Verbs],
  ) {
    this.ctx = { world, dialogue, items, spawner };
  }

  /** Register another verb (e.g. a content pack's 'talk' / 'open'). */
  add(v: VerbDef): void {
    this.verbs.push(v);
  }

  /** The best available (verb, target) for this actor, or undefined. */
  private best(actor: Entity): { verb: VerbDef; target: Entity | undefined } | undefined {
    // self-verbs first (offered regardless of what's nearby)
    for (const verb of this.verbs) {
      if (verb.self && verb.can(actor, undefined, this.ctx)) return { verb, target: undefined };
    }
    const at = actor.transform;
    if (!at) return undefined;
    let best: { verb: VerbDef; target: Entity } | undefined;
    let bestD = Infinity;
    for (const target of this.world.entities) {
      if (target === actor || !target.transform) continue;
      const d = dist2(at.x, at.y, target.transform.x, target.transform.y);
      if (d >= bestD) continue; // nearest interactable wins
      for (const verb of this.verbs) {
        if (verb.self) continue;
        const reach = (verb.reach ?? 24) + at.r + target.transform.r; // radius-aware (big ships read from afar)
        if (d <= reach * reach && verb.can(actor, target, this.ctx)) {
          best = { verb, target };
          bestD = d;
          break;
        }
      }
    }
    return best;
  }

  /** The HUD prompt for the actor's best interaction ('' if none). */
  prompt(actor: Entity): string {
    const b = this.best(actor);
    return b ? `[E] ${b.verb.label(actor, b.target)}` : '';
  }

  /** Run the actor's best interaction. Returns true if something happened. */
  interact(actor: Entity): boolean {
    const b = this.best(actor);
    if (!b) return false;
    b.verb.run(actor, b.target, this.ctx);
    return true;
  }
}
