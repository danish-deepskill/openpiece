import type { Entity } from '../ecs/components';
import type { Rng } from '../core/Rng';
import type { World } from '../ecs/World';
import type { Pathfinder } from '../world/Pathfinder';
import type { SpatialQuery } from '../world/SpatialQuery';
import type { AbilitySystem } from '../systems/AbilitySystem';

/** Everything a brain may read/use while deciding. Treated as read-only except the helpers.
 *  Kept MINIMAL on purpose — this is the sim-facing contract a headless server must satisfy. */
export interface AIContext {
  world: World;
  query: SpatialQuery;
  /** The seeded `ai` stream — ALL brain randomness draws from it (determinism; never Math.random). */
  rng: Rng;
  /** Activate an actor's ability — the SAME attack path the player uses. */
  abilities: AbilitySystem;
  /** Grid A* + line-of-sight, for navigating around walls. */
  pathfinder: Pathfinder;
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
