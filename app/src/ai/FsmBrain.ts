import type { Entity } from '../ecs/components';
import type { AIContext, Brain } from './Brain';

export interface FsmState {
  enter?(e: Entity, ctx: AIContext): void;
  /** Return a state name to transition, or nothing to stay. */
  update(e: Entity, ctx: AIContext, dt: number): string | void;
}

/** Generic finite-state-machine brain. State table is data; transitions are returned by update(). */
export class FsmBrain implements Brain {
  constructor(
    private readonly states: Record<string, FsmState>,
    private readonly initial: string,
  ) {}

  think(e: Entity, ctx: AIContext, dt: number): void {
    const bb = e.ai!.bb;
    if (!bb.state) {
      bb.state = this.initial;
      this.states[bb.state].enter?.(e, ctx);
    }
    const next = this.states[bb.state].update(e, ctx, dt);
    if (next && next !== bb.state) {
      bb.state = next;
      this.states[next].enter?.(e, ctx);
    }
  }
}
