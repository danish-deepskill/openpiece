import { describe, expect, it } from 'vitest';
import { TAG_SLOWED, TAG_STUNNED } from '../src/combat/Effect';
import { TagSet } from '../src/combat/TagSet';
import { TERRAIN } from '../src/defs/terrains';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { MovementSystem } from '../src/systems/MovementSystem';
import { Collision } from '../src/world/Collision';
import { placeStructure } from '../src/world/StructureIndex';
import { TileGrid } from '../src/world/TileGrid';

/**
 * WALL-SLAM (the marine Buttstroke proc): a target flung with `mover.slamStun` armed, mid-knockback, gets an
 * electrified PIN (effect.electrified → state.stunned) if its shove is STOPPED by a wall (MovementSystem detects
 * the blocked slide); flying free it takes the lighter SHOCKED graze (effect.shocked → state.slowed) instead.
 * StrikeResolver arms the flags on the proc roll; this tests the MOVEMENT half — detection + the effect routing.
 */

const T = 32;
function grassGrid(w = 30, h = 30): TileGrid {
  const g = new TileGrid(w, h);
  g.tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => TERRAIN.grass));
  return g;
}

/** A knockback-in-flight body: armed slamStun (wall → pin) + slamSlow (free → graze) + a fast impulse
 *  (dvx/dvy, default straight +x). Carries tags + effects so the CC effects have somewhere to land. */
function flung(world: World, x: number, y: number, dvx = 700, dvy = 0, slamStun = 2, slamSlow = 1.5): Entity {
  return world.create({
    transform: { x, y, angle: 0, r: 11 },
    mover: { vx: 0, vy: 0, speed: 0, mass: 1, mode: 'foot', dodgeT: 0.3, dvx, dvy, slamStun, slamSlow },
    combatant: { stam: 100, maxStam: 100, combo: 0, comboT: 0, posture: 0, maxPosture: 100, blocking: false, parryT: 0 },
    tags: new TagSet(),
    effects: { active: [], seq: 0 },
  });
}

/** The remaining seconds of an active effect (0 if absent) — the assertion-side read of the CC clock. */
function remaining(e: Entity, id: string): number {
  return e.effects!.active.find((a) => a.id === id)?.remaining ?? 0;
}

describe('wall-slam: a shove stopped by a wall electrifies (pins) the target', () => {
  it('slamming into a wall applies the FROZEN electrified pin + kills the impulse', () => {
    const world = new World();
    const g = grassGrid();
    placeStructure(new World(), g.structures, 'structure.wall', 8, 5); // wall at tile (8,5) = x∈[256,288]
    const e = flung(world, 8 * T - 14, 5 * T); // a body-radius WEST of the wall face, shoved +x INTO it
    new MovementSystem(world, new Collision(g)).update(1 / 60);
    expect(e.tags!.has(TAG_STUNNED)).toBe(true); // the pin is a hard CC (rooted + can't act)
    expect(remaining(e, 'effect.electrified')).toBeGreaterThan(1); // the ~2s electric pin landed
    expect(e.tags!.has(TAG_SLOWED)).toBe(false); // the wall outcome won — no graze
    expect(e.mover!.slamStun).toBeUndefined(); // consumed (one-shot — can't re-slam every frame)
    expect(e.mover!.slamSlow).toBeUndefined(); // the no-wall graze was discarded
    expect(e.mover!.dvx).toBe(0); // impulse killed — pinned, not bouncing
  });

  it('a DIAGONAL slam into a wall still pins (measures headway ALONG the shove, not total distance)', () => {
    const world = new World();
    const g = grassGrid();
    for (let cy = 3; cy <= 8; cy++) placeStructure(new World(), g.structures, 'structure.wall', 8, cy); // a TALL wall (x=256), so a diagonal slides ALONG it
    // shoved into the wall at ~45° (+x and +y): +x is blocked, the body SLIDES +y along the wall face. Total
    // distance stays high (the slide), but headway TOWARD the wall (+x) is ~0 → the projection catches the slam.
    const e = flung(world, 8 * T - 14, 5 * T, 500, 500); // diagonal into the wall
    new MovementSystem(world, new Collision(g)).update(1 / 60);
    expect(e.tags!.has(TAG_STUNNED)).toBe(true); // the glancing slam still PINNED it (the bug this guards)
  });

  it('flying free (no wall) applies the lighter SHOCKED graze instead of the pin, then disarms', () => {
    const world = new World();
    const g = grassGrid();
    const e = flung(world, 5 * T, 5 * T); // open field, nothing east
    const move = new MovementSystem(world, new Collision(g));
    for (let i = 0; i < 40; i++) move.update(1 / 60); // ride the whole knockback out
    expect(e.tags!.has(TAG_STUNNED)).toBe(false); // never slammed → never pinned
    expect(e.tags!.has(TAG_SLOWED)).toBe(true); // …but it took the lingering shock
    expect(remaining(e, 'effect.shocked')).toBeGreaterThan(1); // the ~1.5s graze
    expect(e.mover!.slamStun).toBeUndefined(); // both flags disarmed when the impulse ended (no leak)
    expect(e.mover!.slamSlow).toBeUndefined();
  });
});
