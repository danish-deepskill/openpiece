import type { ComponentName, Components, Entity } from './components';

/**
 * Minimal, readable entity store (miniplex-style). `with()` filters the live set on
 * demand — fine for our entity counts. If profiling ever demands it, swap the body
 * for archetype buckets or bitECS without touching callers.
 */
export class World {
  private nextId = 1;
  readonly entities = new Set<Entity>();

  create(components: Omit<Partial<Entity>, 'id'> = {}): Entity {
    const e = { id: this.nextId++, ...components } as Entity;
    this.entities.add(e);
    return e;
  }

  destroy(e: Entity): void {
    this.entities.delete(e);
  }

  /** Every live entity that has all of the named components. */
  with(...names: ComponentName[]): Entity[] {
    const out: Entity[] = [];
    outer: for (const e of this.entities) {
      for (const n of names) if (e[n] === undefined) continue outer;
      out.push(e);
    }
    return out;
  }

  /** The first entity carrying a component (e.g. the singleton player). */
  first(name: ComponentName): Entity | undefined {
    for (const e of this.entities) if (e[name] !== undefined) return e;
    return undefined;
  }

  /** Add or replace a component on an entity. */
  add<K extends ComponentName>(e: Entity, name: K, data: Components[K]): void {
    (e[name] as Components[K]) = data;
  }

  remove(e: Entity, name: ComponentName): void {
    delete e[name];
  }

  get count(): number {
    return this.entities.size;
  }
}
