import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Pathfinder } from '../world/Pathfinder';
import type { SpatialQuery } from '../world/SpatialQuery';
import type { AbilitySystem } from '../systems/AbilitySystem';
import type { FxSystem } from '../systems/FxSystem';

/** Apply damage + knockback to a target. Returns true if it landed (not i-framed/dead). */
export type ApplyDamage = (
  target: Entity,
  dmg: number,
  kx: number,
  ky: number,
  byPlayer?: boolean,
) => boolean;

/** Everything a brain may read/use while deciding. Treated as read-only except the helpers. */
export interface AIContext {
  world: World;
  /** The entity the human currently drives (the `control` tag holder), if any. */
  controlled: Entity | undefined;
  query: SpatialQuery;
  fx: FxSystem;
  /** Activate an actor's ability — the SAME attack path the player uses. */
  abilities: AbilitySystem;
  /** Grid A* + line-of-sight, for navigating around walls. */
  pathfinder: Pathfinder;
  applyDamage: ApplyDamage;
}

/**
 * Strategy interface for autonomous behavior. `think` mutates the entity's movement
 * intent (mover.vx/vy) and may queue actions via the context helpers. Today brains are
 * finite-state machines (FsmBrain); a BehaviorTreeBrain / UtilityBrain / JobBrain can
 * implement this same interface later for RimWorld-style depth — AISystem never changes.
 */
export interface Brain {
  think(e: Entity, ctx: AIContext, dt: number): void;
}
