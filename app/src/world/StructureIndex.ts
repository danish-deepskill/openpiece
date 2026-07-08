import { TILE } from '../config/constants';
import type { ContentId } from '../core/Registry';
import { Structures } from '../defs/structures';
import type { Entity, MoveMode, Structure } from '../ecs/components';
import type { World } from '../ecs/World';
import type { MoveCtx } from './GridCollider';

/** An entity the index PROVED carries `structure` (place() rejects anything else) — so per-cell hot-loop
 *  reads need no `!`. Mirrors the World.with() query-narrowing idiom. */
export type StructureEntity = Entity & { structure: Structure };

/**
 * Per-grid STRUCTURE OCCUPANCY — cell → the structure ENTITY standing on it (RimWorld's EdificeGrid). This is
 * the second layer of the two-layer world model: terrain ordinals say what the GROUND is, this index says what
 * is BUILT on it, and every physical/planning rule composes the two. It's a rebuildable DERIVED index (the
 * entities' `structure` components are the state of record), so it holds live refs, not ids — hot-loop reads
 * (collision oracles sweep it per cell) never pay a byId hop.
 *
 * One index per GRID: the world frame owns one (TileGrid.structures); a deck grid / lower deck / pocket map
 * later owns its own. Placement goes through `placeStructure` (or `place` for an existing entity) so a cell
 * can never be claimed twice — overlap is a worldgen/build bug and throws at once, never a silent shadow.
 */
export class StructureIndex {
  /** Dense cell → entity (undefined = unoccupied). Object refs by design — see the class doc. */
  private readonly cells: Array<StructureEntity | undefined>;
  private readonly placed = new Set<StructureEntity>();
  /** Bumped on every place/remove — renderers watch it to rebake the static structure layer (dirty flag). */
  version = 0;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Array<StructureEntity | undefined>(w * h);
  }

  /** The structure entity occupying a cell (any cell of a multi-tile footprint), or undefined. OOB = empty. */
  at(tx: number, ty: number): StructureEntity | undefined {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return undefined;
    return this.cells[ty * this.w + tx];
  }

  /** Every placed structure entity — for bake passes (render/minimap) that draw each ONCE, not per cell. */
  all(): ReadonlySet<StructureEntity> {
    return this.placed;
  }

  /** Claim every footprint cell for an entity carrying `structure`. Throws on a missing component, an
   *  out-of-bounds footprint, or ANY overlap — checked before stamping, so a failed place claims nothing. */
  place(e: Entity): void {
    const s = e.structure;
    if (!s) throw new Error('StructureIndex.place: entity has no structure component');
    const se = e as StructureEntity; // proven by the throw above — TS can't lift a property guard onto the object type
    const d = Structures.get(s.def);
    if (s.tx < 0 || s.ty < 0 || s.tx + d.size.w > this.w || s.ty + d.size.h > this.h) {
      throw new Error(`StructureIndex.place: ${s.def} footprint at (${s.tx},${s.ty}) leaves the ${this.w}×${this.h} grid`);
    }
    for (let y = s.ty; y < s.ty + d.size.h; y++) {
      for (let x = s.tx; x < s.tx + d.size.w; x++) {
        const other = this.cells[y * this.w + x];
        if (other) throw new Error(`StructureIndex.place: ${s.def} at (${s.tx},${s.ty}) overlaps ${other.structure.def} on cell (${x},${y})`);
      }
    }
    for (let y = s.ty; y < s.ty + d.size.h; y++) {
      for (let x = s.tx; x < s.tx + d.size.w; x++) this.cells[y * this.w + x] = se;
    }
    this.placed.add(se);
    this.version++;
  }

  /** Release a structure's cells — the INDEX half of demolition only (the blessed whole is `removeStructure`,
   *  which also destroys the entity; an index-only remove leaves a ghost door/wall alive in the world).
   *  No-op if the entity was never placed here. */
  remove(e: Entity): void {
    if (!this.placed.delete(e as StructureEntity)) return; // Set.delete narrows nothing — same erased-type cast as place()
    const s = e.structure;
    // a placed entity that lost its component would strand its cells claimed forever — fail loud instead
    if (!s) throw new Error('StructureIndex.remove: placed entity lost its structure component before removal');
    const d = Structures.get(s.def);
    for (let y = s.ty; y < s.ty + d.size.h; y++) {
      for (let x = s.tx; x < s.tx + d.size.w; x++) this.cells[y * this.w + x] = undefined;
    }
    this.version++;
  }

  /** PHYSICAL rule — does the structure on this cell stop a body in this movement context? Composed with the
   *  terrain rule by the frame's collision oracle (world/Collision.ts). Mirrors TileGrid.walkable's vocabulary:
   *  an open door is a doorway; airborne clears everything but TALL (blocksAir); perched (onLedge) stands ON a
   *  low structure; otherwise blocksFoot stops grounded foot/swim/boat alike. */
  blocks(tx: number, ty: number, ctx: MoveCtx): boolean {
    const e = this.at(tx, ty);
    if (!e || e.structure.open) return false;
    const d = Structures.get(e.structure.def);
    if (ctx.airborne) return d.blocksAir;
    if (ctx.onLedge && d.blocksFoot && !d.blocksAir) return false; // perched atop the low structure
    return d.blocksFoot;
  }

  /** PLANNING rule (AI pathfinding + line-of-sight) — like TileGrid.pathable: a foot route treats doors as
   *  passable (DoorSystem opens them on arrival) even while they physically block. */
  pathable(tx: number, ty: number, mode: MoveMode): boolean {
    const e = this.at(tx, ty);
    if (!e || e.structure.open) return true;
    const d = Structures.get(e.structure.def);
    if (mode === 'foot' && d.door) return true;
    return !d.blocksFoot;
  }

  /** Does the structure on this cell block VISION? (An open door sees through.) A SEAM for the future
   *  line-of-sight system — no runtime consumer yet (AI sight currently rays PATHABILITY, and the debug
   *  collision overlay shows blocking); pinned by structures.test.ts until LOS lands. */
  opaqueAt(tx: number, ty: number): boolean {
    const e = this.at(tx, ty);
    if (!e || e.structure.open) return false;
    return Structures.get(e.structure.def).opaque === true;
  }
}

/** Spawn a structure ENTITY and claim its cells in one step — the blessed way to build (worldgen, tests, and
 *  the future build verb all come through here, so entity + index can never drift). Transform sits at the
 *  footprint's center with r spanning its narrow side — structures are first-class entities (inspectable,
 *  damageable later), not render props. */
export function placeStructure(world: World, index: StructureIndex, def: ContentId, tx: number, ty: number): Entity {
  const d = Structures.get(def);
  const e = world.create({
    transform: { x: (tx + d.size.w / 2) * TILE, y: (ty + d.size.h / 2) * TILE, angle: 0, r: (Math.min(d.size.w, d.size.h) * TILE) / 2 },
    structure: { def, tx, ty },
  });
  index.place(e);
  return e;
}

/** Demolish — placeStructure's mirror and the ONE removal path: release the cells AND destroy the entity in
 *  the same step, so the index (what collision reads) and the world (what DoorSystem/renderers iterate) can
 *  never disagree about whether a structure exists. Destruction/deconstruction land on top of this. */
export function removeStructure(world: World, index: StructureIndex, e: Entity): void {
  index.remove(e);
  world.destroy(e);
}
