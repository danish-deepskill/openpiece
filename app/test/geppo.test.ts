import { describe, expect, it } from 'vitest';
import { GEPPO_FALL_DUR, GEPPO_KICK_INTERVAL, GEPPO_KICK_STAM, GEPPO_MOVE_MULT, JUMP_LAND_STUN } from '../src/config/constants';
import { TERRAIN } from '../src/defs/terrains';
import { Rng } from '../src/core/Rng';
import { Manuals } from '../src/defs/manuals';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MovementSystem } from '../src/systems/MovementSystem';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * GEPPO (docs/design/MOVEMENT_AIR.md) — the LEARNED toggle-hover: manual.geppo teaches ability.geppo, which
 * toggles the mover's `hovering`. While hovering, MovementSystem keeps it airborne, spends stamina per KICK,
 * and auto-lands (+ landing stun) when a kick is unaffordable. Two-layer model: it's just `layer:'air'` held.
 */

const abilities = (world: World) => new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));
function grassGrid() {
  const g = new TileGrid(50, 50);
  g.tiles = Array.from({ length: 50 }, () => Array.from({ length: 50 }, () => TERRAIN.grass));
  return g;
}
const move = (world: World) => new MovementSystem(world, new Collision(grassGrid()));

describe('the Geppo manual teaches the ability', () => {
  it('manual.geppo teaches ability.geppo (the data contract)', () => {
    expect(Manuals.get('manual.geppo').teaches).toBe('ability.geppo');
  });

  it('a fresh unit does NOT know Geppo (it must be learned from the book)', () => {
    const e = new Spawner(new World(), new Rng(1)).spawnHero(0, 0);
    expect(e.loadout!.granted.has('ability.geppo')).toBe(false);
  });
});

describe('Geppo toggle-hover (AbilitySystem + MovementSystem)', () => {
  /** A hero that has learned Geppo, with a full stamina bar. */
  function geppoHero(world: World) {
    const e = new Spawner(world, new Rng(1)).spawnHero(100, 100);
    e.loadout!.granted.add('ability.geppo'); // learned from the manual
    e.combatant!.stam = 100;
    return e;
  }

  it('toggling Geppo ON goes airborne + hovering; toggling again FALLS then lands (+ landing stun)', () => {
    const world = new World();
    const e = geppoHero(world);
    expect(abilities(world).activate(e, 'ability.geppo')).toBe(true);
    expect(e.mover!.hovering).toBe(true);
    expect(e.mover!.layer).toBe('air');

    // toggle OFF → begins a FALL (a descent window), NOT an instant snap to the ground
    abilities(world).activate(e, 'ability.geppo');
    expect(e.mover!.hovering).toBe(false);
    expect(e.mover!.fallT).toBeGreaterThan(0); // descending…
    const mv = move(world);
    mv.update(0.01); // one tick in — still falling, still airborne (not snapped down)
    expect(e.mover!.layer).toBe('air');
    mv.update(GEPPO_FALL_DUR); // finish the descent
    expect(e.mover!.layer).toBe('ground'); // touched down at the bottom of the fall
    expect(e.combatant!.stunT).toBeCloseTo(JUMP_LAND_STUN, 5); // punishable on landing, like a jump
  });

  it('stays AIRBORNE across many ticks while hovering (never lands on its own)', () => {
    const world = new World();
    const e = geppoHero(world);
    abilities(world).activate(e, 'ability.geppo');
    const mv = move(world);
    for (let i = 0; i < 20; i++) mv.update(0.1); // 2s of hovering — well past a one-shot jump's ~0.55s
    expect(e.mover!.layer).toBe('air'); // still up (kicking off the air)
    expect(e.mover!.hovering).toBe(true);
  });

  it('moves 1.5x faster while hovering (skating through the air)', () => {
    const world = new World();
    const grid = grassGrid();
    const e = geppoHero(world);
    e.transform!.x = 100;
    e.mover!.vx = 100; // steady eastward intent
    e.mover!.vy = 0;
    const mv = new MovementSystem(world, new Collision(grid));

    // grounded baseline: distance moved in 0.1s
    e.mover!.hovering = false;
    e.mover!.layer = 'ground';
    const x0 = e.transform!.x;
    mv.update(0.1);
    const groundDist = e.transform!.x - x0;

    // hovering: the SAME intent covers 1.5x the distance
    e.transform!.x = 100;
    e.mover!.hovering = true;
    e.mover!.layer = 'air';
    const x1 = e.transform!.x;
    mv.update(0.1);
    const hoverDist = e.transform!.x - x1;
    expect(hoverDist).toBeCloseTo(groundDist * GEPPO_MOVE_MULT, 3);
  });

  it('each KICK spends stamina (the hover is stamina-bounded, not free flight)', () => {
    const world = new World();
    const e = geppoHero(world);
    abilities(world).activate(e, 'ability.geppo');
    const before = e.combatant!.stam;
    move(world).update(GEPPO_KICK_INTERVAL + 0.001); // cross exactly one kick boundary
    expect(before - e.combatant!.stam).toBeCloseTo(GEPPO_KICK_STAM, 1); // one kick's cost
  });

  it('AUTO-LANDS when stamina runs out mid-hover (can\'t afford the next kick)', () => {
    const world = new World();
    const e = geppoHero(world);
    e.combatant!.stam = GEPPO_KICK_STAM + 1; // enough for ONE kick, not two
    abilities(world).activate(e, 'ability.geppo');
    const mv = move(world);
    mv.update(GEPPO_KICK_INTERVAL + 0.001); // kick 1 — affordable
    expect(e.mover!.hovering).toBe(true);
    // advance to just past the 2nd kick boundary in SMALL steps so the fall it triggers isn't consumed in one big dt
    for (let acc = 0; acc < GEPPO_KICK_INTERVAL + 0.001; acc += 0.05) mv.update(0.05);
    expect(e.mover!.hovering).toBe(false); // ran out of gas → stopped hovering
    expect(e.mover!.fallT).toBeGreaterThan(0); // …into a DESCENT (not snapped down)
    expect(e.mover!.layer).toBe('air'); // still airborne while falling
    for (let acc = 0; acc < GEPPO_FALL_DUR + 0.05; acc += 0.05) mv.update(0.05); // finish the descent
    expect(e.mover!.layer).toBe('ground'); // grounded after the fall
  });
});
