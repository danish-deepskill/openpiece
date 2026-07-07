import { equipItem, unequipToBag } from '../combat/equip';
import { events } from '../core/EventBus';
import { dist2 } from '../core/math';
import { itemName } from '../defs/items';
import { Manuals } from '../defs/manuals';
import { ShipHulls } from '../defs/ships';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { DialogueSystem } from './DialogueSystem';
import type { ShipSystem } from './ShipSystem';

/** Services a verb's `run` may need to carry out its effect. */
export interface VerbCtx {
  world: World;
  ships: ShipSystem;
  dialogue: DialogueSystem;
}

/**
 * One thing an actor can DO — to a nearby entity (`take`, `board`, `talk`, `open`, `harvest`) or to itself
 * (`disembark`). Availability is decided by `can()` querying the actor + target's COMPONENTS, so a verb
 * applies to ANY entity that qualifies — the Moat for interaction: no per-object code, no `if (name === …)`.
 * A new interaction is a new VerbDef, never a new branch in the input/scene code.
 */
export interface VerbDef {
  id: string;
  /** The on-screen prompt label, e.g. "Equip Cutlass" / "Board the Sloop". */
  label: (actor: Entity, target: Entity | undefined) => string;
  /** Extra reach (px) beyond the two body radii (target verbs). Default 24. */
  reach?: number;
  /** A self-verb acts on the actor with no nearby-target scan (e.g. disembark); offered first. */
  self?: boolean;
  can: (actor: Entity, target: Entity | undefined, ctx: VerbCtx) => boolean;
  run: (actor: Entity, target: Entity | undefined, ctx: VerbCtx) => void;
}

/**
 * Take any world item: it enters the actor's BAG, then auto-equips. If its slot is already occupied the
 * displaced item stays in the bag (a pickup always swaps you into the newer gear — the "good UX" rule).
 * One generic path for weapon/fruit/accessory — no per-kind branch (itemName/equipItem do the dispatch).
 */
function takePickup(actor: Entity, target: Entity | undefined, ctx: VerbCtx): void {
  const ref = target!.pickup!.item;
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
  const bag = (actor.inventory ??= { items: [] }); // any actor can own a bag (the Moat)
  const displaced = unequipToBag(actor, ref); // vacate the target slot; returns the old occupant (or undefined)
  if (displaced) bag.items.push(displaced); // the swapped-out item drops into the bag
  equipItem(actor, ref); // wear the new one (equip's own displace path sees an already-empty slot now)
  const eaten = ref.cat === 'fruit';
  events.emit('notify', { msg: `${eaten ? 'Ate the' : 'Equipped'} ${itemName(ref)}${eaten ? '!' : '.'}` });
  if (displaced) events.emit('notify', { msg: `${itemName(displaced)} → bag.` });
  ctx.world.destroy(target!); // RenderSystem's orphan sweep destroys the gfx
}

/** The base verb set. Content/systems append more (talk, open, harvest, sit, read) — each is one entry. */
export const Verbs: VerbDef[] = [
  {
    id: 'verb.disembark',
    self: true,
    label: () => 'Disembark',
    can: (a) => !!a.riding,
    run: (a, _t, ctx) => ctx.ships.disembark(a),
  },
  {
    id: 'verb.board',
    reach: 38,
    label: (_a, t) => `Board the ${ShipHulls.get(t!.ship!.hull).name}`,
    can: (a, t) => !a.riding && !!t?.ship,
    run: (a, t, ctx) => ctx.ships.board(a, t!),
  },
  {
    id: 'verb.take',
    reach: 20,
    label: (_a, t) => {
      const cat = t!.pickup!.item.cat;
      return `${cat === 'fruit' ? 'Eat' : cat === 'manual' ? 'Read' : 'Take'} ${itemName(t!.pickup!.item)}`;
    },
    can: (a, t) => !a.riding && !!t?.pickup,
    run: takePickup,
  },
  {
    id: 'verb.talk',
    reach: 24,
    label: (_a, t) => `Talk to ${t!.identity?.name ?? 'someone'}`,
    can: (a, t) => !a.riding && !!t?.npc,
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
 * prompt and the E-press, so they can never disagree. Self-verbs (disembark) win; otherwise the nearest entity
 * offering an available verb. O(N) scan today (small N); sits behind the same seam as SpatialQuery to swap for
 * a grid at scale.
 */
export class InteractionSystem {
  private readonly ctx: VerbCtx;
  constructor(
    private readonly world: World,
    ships: ShipSystem,
    dialogue: DialogueSystem,
    private readonly verbs: VerbDef[] = [...Verbs],
  ) {
    this.ctx = { world, ships, dialogue };
  }

  /** Register another verb (e.g. a content pack's 'talk' / 'open'). */
  add(v: VerbDef): void {
    this.verbs.push(v);
  }

  /** The best available (verb, target) for this actor, or undefined. */
  private best(actor: Entity): { verb: VerbDef; target: Entity | undefined } | undefined {
    // self-verbs first (disembark is always offered while riding, regardless of what's nearby)
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
