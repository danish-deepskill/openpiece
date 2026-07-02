/**
 * Generic object pool for high-churn, presentation-only objects (particles, damage
 * texts, swing arcs). Gameplay actors live in the ECS instead — this keeps the hot
 * path allocation-free without polluting the entity world.
 */
export class Pool<T> {
  private free: T[] = [];
  readonly active: T[] = [];

  constructor(
    private readonly create: () => T,
    private readonly reset: (item: T) => void,
    prealloc = 0,
  ) {
    for (let i = 0; i < prealloc; i++) this.free.push(create());
  }

  acquire(): T {
    const item = this.free.pop() ?? this.create();
    this.active.push(item);
    return item;
  }

  release(item: T): void {
    const i = this.active.indexOf(item);
    if (i === -1) return;
    this.active.splice(i, 1);
    this.reset(item);
    this.free.push(item);
  }
}
