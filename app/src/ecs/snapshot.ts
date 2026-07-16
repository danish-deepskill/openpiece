import { actorBrain } from '../ai/brains';
import { StatBlock, type StatBlockSnapshot } from '../combat/StatBlock';
import { TagSet } from '../combat/TagSet';
import type { ContentId } from '../core/Registry';
import { AIProfiles } from '../defs/aiProfiles';
import type { Blackboard, ComponentName, Components, Entity, Loadout } from './components';
import type { World } from './World';

/**
 * World ↔ plain-JSON snapshots — the seed of the persistence pillar (ARCHITECTURE_SCALE §11 #2) and the
 * state-hash for the same-seed replay invariant (test/invariants.test.ts). Rules, per the Scribe lessons
 * the atlas confirmed (rimworld-simple/16 + ballpiece-comparison.md):
 *  - Defs are NEVER saved — only ids (`bb.profile` → profileId; every ContentId field is already an id).
 *  - Cross-entity refs are ids at rest already (architecture test enforces it) — they serialize as-is and
 *    re-resolve through world.byId after restore, so restore needs no fixup pass TODAY. If a live-ref
 *    component ever appears, restore grows RimWorld's resolve-refs pass — don't let it come to that.
 *  - DERIVED state is rebuilt, not saved: StatBlock's cache, the StructureIndex (re-`place()` each
 *    restored `structure` entity into the fresh grid's index), and `bb.path` (repathed within 0.5s).
 *  - The blessed class components (StatBlock, TagSet) round-trip through their own accessors; Set/Map
 *    fields (grudge.ids, loadout.granted/cd/cdMax) become arrays. Everything else is plain data BY CANON.
 */

/** One entity: its id + every component as JSON-safe plain data (key order = live component order). */
export interface EntitySnapshot {
  id: number;
  components: Record<string, unknown>;
}

export interface WorldSnapshot {
  /** The id counter, NOT derivable from the live max: despawned entities minted ids too, and stale
   *  at-rest refs (grudge.ids, a dead quarryId) may still name them — a restore that recounted from the
   *  live max would re-issue those ids to new spawns, aiming old grudges at innocent newcomers. */
  nextId: number;
  entities: EntitySnapshot[];
}

/** loadout with its Set/Map fields flattened to arrays. */
interface LoadoutSnap extends Omit<Loadout, 'granted' | 'cd' | 'cdMax'> {
  granted: ContentId[];
  cd: Array<[ContentId, number]>;
  cdMax: Array<[ContentId, number]>;
}

/** ai with the live pieces replaced: brain dropped (the shared actorBrain singleton is re-attached on
 *  restore — store a brain KEY here the day a second brain exists), profile → its def id, path dropped. */
interface AiSnap {
  profileId: ContentId;
  bb: Omit<Blackboard, 'profile' | 'path'>;
}

/**
 * Deep-copy STRICTLY plain data; throw on anything else — the §4 canon ("components are plain,
 * serializable data") made executable. structuredClone was rejected here because it happily clones a
 * Set/Map/class instance that JSON.stringify then silently writes as `{}` — and that corruption is a
 * FIXED POINT of re-serialization, invisible to every round-trip test. Non-finite numbers are rejected
 * for the same reason (JSON writes NaN/Infinity as null). The path names the guilty field in the throw.
 */
function plainClone(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`snapshot: non-finite number at ${path} — JSON would silently write null`);
    return value;
  }
  if (Array.isArray(value)) return value.map((v, i) => plainClone(v, `${path}[${i}]`));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = plainClone(v, `${path}.${k}`);
    return out;
  }
  throw new Error(`snapshot: non-plain value at ${path} — add a snapComponent arm for this component shape`);
}

/** Component value → JSON-safe plain data. The switch names every non-plain component; the default arm is
 *  the canon guarantee ("components are plain, serializable data") made executable — structuredClone throws
 *  on functions/engine objects, so a future non-plain component fails HERE, loudly, not in a save file. */
function snapComponent(name: ComponentName, value: NonNullable<Components[ComponentName]>): unknown {
  switch (name) {
    case 'attributes':
      return (value as StatBlock).snapshot();
    case 'tags':
      return (value as TagSet).all();
    case 'grudge': {
      const g = value as Components['grudge'];
      return { ids: [...g.ids] };
    }
    case 'loadout': {
      const lo = value as Loadout;
      const snap: LoadoutSnap = { ...lo, granted: [...lo.granted], cd: [...lo.cd], cdMax: [...lo.cdMax] };
      return plainClone(snap, 'loadout'); // deep-copy: the shallow spread still aliases innate/slots/chain
    }
    case 'ai': {
      const { profile, path: _path, ...bb } = (value as Components['ai']).bb; // path is derived — repathed on the next think
      const snap: AiSnap = { profileId: profile.id, bb: plainClone(bb, 'ai.bb') as AiSnap['bb'] }; // deep-copy: bb.home mutates EVERY tick for followers
      return snap;
    }
    default:
      return plainClone(value, name);
  }
}

/** Inverse of snapComponent — input is PARSED JSON (never live objects), so nothing here can alias a
 *  previous world. Casts are the serialization boundary's untyped-input narrowing, localized to this arm. */
function restoreComponent(name: ComponentName, raw: unknown): unknown {
  switch (name) {
    case 'attributes':
      return StatBlock.restore(raw as StatBlockSnapshot);
    case 'tags': {
      const t = new TagSet();
      for (const s of raw as string[]) t.add(s);
      return t;
    }
    case 'grudge':
      return { ids: new Set((raw as { ids: number[] }).ids) };
    case 'loadout': {
      const lo = raw as LoadoutSnap;
      return { ...lo, granted: new Set(lo.granted), cd: new Map(lo.cd), cdMax: new Map(lo.cdMax) };
    }
    case 'ai': {
      const a = raw as AiSnap;
      return { brain: actorBrain, bb: { ...a.bb, profile: AIProfiles.get(a.profileId) } };
    }
    default:
      return raw;
  }
}

/** Capture every live entity as plain data. JSON.stringify(snapshotWorld(w)) is the world's state hash. */
export function snapshotWorld(world: World): WorldSnapshot {
  const entities: EntitySnapshot[] = [];
  for (const e of world.entities) {
    const components: Record<string, unknown> = {};
    for (const key of Object.keys(e)) {
      if (key === 'id') continue;
      const name = key as ComponentName; // Entity = {id} & Partial<Components>, so every other key is a component
      const value = e[name];
      if (value !== undefined) components[name] = snapComponent(name, value);
    }
    entities.push({ id: e.id, components });
  }
  return { nextId: world.nextEntityId, entities };
}

/**
 * Rebuild entities into `world` (expected fresh) in ascending-id order — World's entity Set iterates in
 * insertion order, so restore order IS the world's future iteration order; ascending id reproduces the
 * original creation order and keeps every id-ordered tiebreak (pair resolution, lane sort) byte-identical.
 * Derived indexes are the CALLER's step: re-`place()` each restored `structure` entity into its grid's
 * StructureIndex (see world/StructureIndex.ts) before any system reads the grid.
 */
export function restoreWorld(snap: WorldSnapshot, world: World): void {
  const ordered = [...snap.entities].sort((a, b) => a.id - b.id);
  for (const es of ordered) {
    const components: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(es.components)) {
      components[key] = restoreComponent(key as ComponentName, raw);
    }
    world.restoreEntity(es.id, components as Omit<Partial<Entity>, 'id'>); // untyped-boundary cast: shapes were produced by snapComponent's inverses
  }
  // AFTER the loop (restoreEntity already advanced past the live max): replay the SAVED counter, so ids
  // minted-then-despawned before the save are never re-issued to post-load spawns (stale grudge/quarry refs)
  world.advanceNextId(snap.nextId);
}
