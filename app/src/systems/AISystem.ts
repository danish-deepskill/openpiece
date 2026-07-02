import type { AIContext } from '../ai/Brain';
import type { World } from '../ecs/World';

/** Runs each AI entity's brain. Skips whoever holds the `control` tag — the human drives that one. */
export class AISystem {
  constructor(
    private readonly world: World,
    private readonly ctx: AIContext,
  ) {}

  update(dt: number): void {
    for (const e of this.world.with('ai', 'transform', 'mover')) {
      if (e.control) continue;
      e.ai.brain.think(e, this.ctx, dt);
    }
  }
}
