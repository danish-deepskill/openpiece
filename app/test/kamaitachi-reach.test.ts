import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MeleeSystem } from '../src/systems/MeleeSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';
import { SpatialQuery } from '../src/world/SpatialQuery';

/** Run the whole Kamaitachi channel against a Marine Officer standing `dist` px straight ahead; return how many
 *  separate hits landed on him (HP drops between ticks). The AI is NOT running: he just stands there, no guard. */
function hitsAt(dist: number): { hits: number; reach: number; blows: number[] } {
  const world = new World();
  const sp = new Spawner(world, new Rng(1));
  const samurai = sp.spawnUnit('unit.samurai', 0, 0);
  samurai.transform!.angle = 0; // facing +x
  const officer = sp.spawnUnit('unit.marineOfficer', dist, 0);
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const abilities = new AbilitySystem(world, new EffectSystem(world), strikes, new Rng(1));
  const melee = new MeleeSystem(world, strikes, new SpatialQuery(world));
  expect(abilities.activate(samurai, 'ability.kamaitachi')).toBe(true);
  let hits = 0;
  const blows: number[] = []; // each hit's damage, in order
  let hp = officer.health!.hp;
  for (let i = 0; i < 6 * 60 + 5 && samurai.melee; i++) {
    melee.update(1 / 60);
    abilities.update(1 / 60);
    if (officer.health!.hp < hp) {
      hits++;
      blows.push(hp - officer.health!.hp);
    }
    hp = officer.health!.hp;
  }
  const d = Abilities.get('ability.kamaitachi');
  const reach = (samurai.attributes!.get('reach') ?? 0) * (d.shape!.reachMul ?? 1);
  return { hits, reach, blows };
}

/** The officer's flat defense (what every hit pays) — from a fresh spawn, so the arithmetic above is explicit. */
function officer_def(): number {
  return new Spawner(new World(), new Rng(1)).spawnUnit('unit.marineOfficer', 0, 0).attributes!.get('def');
}

describe('Kamaitachi — the big sweeps and the wind really land', () => {
  it('a target INSIDE the blade takes every window; one beyond the blade but inside the large sweeps takes only those; one in the wind-only band takes one', () => {
    const near = hitsAt(40); // on the blade
    expect(near.hits).toBe(31); // every window: 25 blade cuts + 5 large sweeps + the wind
    // the five LARGE sweeps land at DOUBLE the base of the cut before them (every landed hit also feeds the combo
    // counter, so the blows ramp — hence a ratio against the neighbour, not a constant). Compare BEFORE the
    // officer's flat defense comes off (add it back), where the 2× is exact up to the +1 combo step.
    const def = officer_def();
    const base = near.blows.map((b) => b + def);
    const doubled = base.map((b, i) => (i > 0 ? b / base[i - 1]! : 1)).filter((r) => r > 1.5);
    expect(doubled).toHaveLength(5);
    for (const r of doubled) expect(r).toBeGreaterThan(1.9); // 2 × (atk+combo)/(atk+combo−1): just over 2 (the +1 combo step)
    for (const r of doubled) expect(r).toBeLessThan(2.1); // at the C-tier atk of 25 the step is 1/26 — ≈2.08 at most
    const mid = hitsAt(88); // past the blade's tip, inside the large sweeps' 24–96px band
    expect(mid.reach).toBeLessThan(88); // proves "past the blade"
    expect(mid.hits).toBe(6); // the 5 large sweeps + the wind, and NOTHING from the blade windows
    const far = hitsAt(110); // past the large sweeps (96), inside the wind's 24–120px band
    expect(far.hits).toBe(1); // the wind alone
    const out = hitsAt(140); // beyond everything (a body at 130 still has its 11px edge inside the 120px wind)
    expect(out.hits).toBe(0);
  });
});
