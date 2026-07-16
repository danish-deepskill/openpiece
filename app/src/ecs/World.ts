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

  /** Snapshot-restore path (ecs/snapshot): re-register an entity under its ORIGINAL id — ids are the
   *  cross-entity refs (quarryId, shipId, projectile.owner…), so a restore that re-minted ids would sever
   *  every one. nextId advances past every restored id, but that alone is NOT the collision guarantee —
   *  the original world's nextId may sit above the highest LIVE id (despawned entities minted ids too, and
   *  stale refs like grudge.ids may still point there). restoreWorld() replays the SAVED nextId via
   *  advanceNextId() to close that gap. */
  restoreEntity(id: number, components: Omit<Partial<Entity>, 'id'>): Entity {
    if (this.index.has(id)) throw new Error(`World.restoreEntity: id ${id} is already live`);
    const e = { id, ...components } as Entity;
    this.entities.add(e);
    this.index.set(id, e);
    if (id >= this.nextId) this.nextId = id + 1;
    return e;
  }

  /** The id the NEXT create() will mint — snapshotted so a restored world never re-issues an id that a
   *  stale at-rest ref (a dead quarryId, a permanent grudge entry) might still name. */
  get nextEntityId(): number {
    return this.nextId;
  }

  /** Restore path only: never lower (a lowered counter would re-issue live or referenced ids). */
  advanceNextId(to: number): void {
    if (to > this.nextId) this.nextId = to;
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
