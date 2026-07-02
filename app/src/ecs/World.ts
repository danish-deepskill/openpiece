import type { ComponentName, Components, Entity } from './components';

/** An entity a `with(...K)` query PROVED to carry K — those components become non-optional, so callers
 *  need no `!`. (Accessing a component you did NOT query stays optional — the compiler audits the contract.) */
export type With<K extends ComponentName> = Entity & { [P in K]-?: NonNullable<Components[P]> };

/**
 * Minimal, readable entity store (miniplex-style). `with()` filters the live set on
 * demand — fine for our entity counts. If profiling ever demands it, swap the storage
 * for archetype buckets or bitECS (query call sites survive; direct component
 * mutation — the house style — would need a codemod at that point, accepted).
 */
export class World {
  private nextId = 1;
  readonly entities = new Set<Entity>();
  private readonly index = new Map<number, Entity>(); // id → entity, so id-at-rest refs resolve O(1)

  create(components: Omit<Partial<Entity>, 'id'> = {}): Entity {
    const e = { id: this.nextId++, ...components } as Entity;
    this.entities.add(e);
    this.index.set(e.id, e);
    return e;
  }

  destroy(e: Entity): void {
    this.entities.delete(e);
    this.index.delete(e.id);
  }

  /** Resolve a stored entity id (components keep cross-entity refs as IDS at rest — serializable, and a
   *  destroyed entity reads as `undefined` instead of a stale live pointer). */
  byId(id: number): Entity | undefined {
    return this.index.get(id);
  }

  /** Every live entity that has all of the named components (typed as guaranteed-present). */
  with<K extends ComponentName>(...names: K[]): Array<With<K>> {
    const out: Array<With<K>> = [];
    outer: for (const e of this.entities) {
      for (const n of names) if (e[n] === undefined) continue outer;
      out.push(e as With<K>);
    }
    return out;
  }

  /** The first entity carrying a component (e.g. the singleton player). */
  first<K extends ComponentName>(name: K): With<K> | undefined {
    for (const e of this.entities) if (e[name] !== undefined) return e as With<K>;
    return undefined;
  }

  get count(): number {
    return this.entities.size;
  }
}
