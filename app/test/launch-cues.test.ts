import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { TAG_PHASING } from '../src/combat/Effect';
import { Rng } from '../src/core/Rng';
import { TERRAIN } from '../src/defs/terrains';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { BodyCollisionSystem } from '../src/systems/BodyCollisionSystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';
import { Collision } from '../src/world/Collision';
import { SpatialQuery } from '../src/world/SpatialQuery';
import { TileGrid } from '../src/world/TileGrid';

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(2));
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));
  const g = new TileGrid(30, 30);
  g.tiles = Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => TERRAIN.grass));
  const bodies = new BodyCollisionSystem(world, new SpatialQuery(world), new Collision(g));
  return { world, sp, abilities, bodies };
}

/** Drive a swing's clock to `progress` and let AbilitySystem fire whatever cues it crossed (MeleeSystem owns m.t in play). */
function at(e: ReturnType<Spawner['spawnUnit']>, abilities: AbilitySystem, progress: number): void {
  e.melee!.t = progress * e.melee!.dur;
  abilities.update(1 / 60);
}

describe('launchAt cues — a swing that carries its own impulses', () => {
  it('Sandan is a DASH STRING: three impulses back to back, each re-aimed at the live direction; a swing breaks it', () => {
    const { sp, abilities } = rig();
    const e = sp.spawnUnit('unit.ronin', 320, 320);
    e.transform!.angle = 0;
    expect(e.loadout!.dash).toBe('ability.sandan'); // his Q
    expect(abilities.activate(e, 'ability.sandan')).toBe(true);
    const m = e.mover!;
    expect(m.dodgeT).toBeGreaterThan(0); // step one, immediately
    expect(m.dvx).toBeGreaterThan(0); // aimed +x (facing)
    const gap = Abilities.get('ability.sandan').dashGap!;
    expect(m.dashChain).toEqual({ ability: 'ability.sandan', left: 2, wait: gap });
    expect(e.tags!.has(TAG_PHASING)).toBe(true);
    abilities.update(1 / 60);
    expect(m.dashChain!.left).toBe(2); // step one still in flight — no new impulse yet
    m.dodgeT = 0; // step one ends → the PLANT: the next step waits out the gap
    m.vx = 0; m.vy = 0;
    abilities.update(1 / 60);
    expect(m.dodgeT).toBe(0); // not yet
    e.transform!.angle = Math.PI; // the player turned during the plant (or the brain re-faced its target)
    m.vx = -10; m.vy = 0; // …and is holding A
    for (let i = 0; i < Math.ceil(gap * 60) + 1; i++) abilities.update(1 / 60);
    expect(m.dvx).toBeLessThan(0); // step two goes the NEW way
    expect(m.dashChain!.left).toBe(1);
    m.dodgeT = 0;
    for (let i = 0; i < Math.ceil(gap * 60) + 1; i++) abilities.update(1 / 60);
    expect(m.dashChain).toBeUndefined(); // the third fired; the string is spent
    expect(m.dodgeT).toBeGreaterThan(0);
    // a swing mid-string ends it
    m.dashChain = { ability: 'ability.sandan', left: 2, wait: 0 }; // plant a string by hand (the ability is on cooldown)
    m.dodgeT = 0;
    e.melee = { ability: 'ability.kaeshi', t: 0, dur: 0.5, motion: 'arc', phases: { windup: 0.4, active: 0.3, recover: 0.3 }, side: 1, angle: 0, hitByVolume: [] };
    abilities.update(1 / 60);
    expect(m.dashChain).toBeUndefined();
    expect(m.dodgeT).toBe(0); // no step fired into the swing
  });

  it('a dash-cut fires its one cue when the cut goes active, aim LOCKED at the press', () => {
    const { sp, abilities } = rig();
    const e = sp.spawnUnit('unit.ronin', 320, 320);
    e.transform!.angle = 0.5;
    expect(abilities.activate(e, 'ability.shukuchiGiri')).toBe(true);
    const m = e.melee!;
    const locked = m.angle; // the swing's own aim at the press (startSwing applies its hand-side offset to the facing)
    at(e, abilities, 0.1);
    expect(m.launches ?? 0).toBe(0); // the windup: no step yet (the tell is honest)
    e.transform!.angle = 2; // turning mid-windup does NOT redirect a locked step
    at(e, abilities, 0.31);
    expect(m.launches).toBe(1);
    expect(m.angle).toBe(locked);
  });

  it('the Rocket still works as the one-cue case (launchAt [0.42])', () => {
    const { sp, abilities } = rig();
    const e = sp.spawnUnit('unit.luffy', 320, 320);
    expect(abilities.activate(e, 'ability.gomuRocket')).toBe(true);
    at(e, abilities, 0.3);
    expect(e.melee!.launches ?? 0).toBe(0);
    at(e, abilities, 0.43);
    expect(e.melee!.launches).toBe(1);
    expect(e.mover!.dodgeT).toBeGreaterThan(0);
  });
});

describe('phasing — a tagged body is as un-solid as an airborne one', () => {
  it('two overlapping bodies push apart; tag one PHASING and neither moves', () => {
    const { sp, bodies } = rig();
    const a = sp.spawnUnit('unit.thug', 320, 320);
    const b = sp.spawnUnit('unit.soldier', 326, 320); // overlapping (r 11 each)
    bodies.update();
    expect(a.transform!.x).toBeLessThan(320);
    expect(b.transform!.x).toBeGreaterThan(326);
    a.transform!.x = 320;
    b.transform!.x = 326;
    a.tags!.add(TAG_PHASING);
    bodies.update();
    expect(a.transform!.x).toBe(320); // passes through…
    expect(b.transform!.x).toBe(326); // …and doesn't shove the body it passes
  });
});
