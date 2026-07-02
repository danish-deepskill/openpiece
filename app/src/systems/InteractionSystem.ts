import { equip } from '../combat/equip';
import { events } from '../core/EventBus';
import { dist2 } from '../core/math';
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

function takePickup(actor: Entity, target: Entity | undefined, ctx: VerbCtx): void {
  const pk = target!.pickup!;
  if (pk.kind === 'weapon') {
    equip(actor, 'weapon', pk.defId);
    events.emit('notify', { msg: `Equipped ${pk.label}.` });
  } else {
    equip(actor, 'fruit', pk.defId);
    events.emit('notify', { msg: `Ate the ${pk.label}!` });
  }
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
    label: (_a, t) => `${t!.pickup!.kind === 'weapon' ? 'Equip' : 'Take'} ${t!.pickup!.label}`,
    can: (a, t) => !a.riding && !!t?.pickup,
    run: takePickup,
  },
  {
    id: 'verb.talk',
    reach: 24,
    label: (_a, t) => `Talk to ${t!.identity?.name ?? 'someone'}`,
    can: (a, t) => !a.riding && !!t?.npc,
    run: (_a, t, ctx) =>
      ctx.dialogue.open(
        t!.identity?.name ?? 'Someone',
        t!.npc!.dialogue,
        t!.render?.baseColor ?? 0xe0a070,
        t!.render?.hatColor ?? 0x888888,
      ),
  },
];

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
