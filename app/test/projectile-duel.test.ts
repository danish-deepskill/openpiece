import { describe, expect, it } from 'vitest';
import { effectiveTier } from '../src/combat/dominance';
import { applyEffect } from '../src/combat/Effect';
import { letters } from '../src/combat/PowerTier';
import { events } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { TERRAIN } from '../src/defs/terrains';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { ProjectileSystem } from '../src/systems/ProjectileSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';

/**
 * SHOT MEETS SHOT — the flying-slash duel. The ladder first (rungs stamped at fire), then the class: a slash cuts a ball,
 * equals burst each other. No dice. Owners must be enemies.
 */
const SIM = 1 / 60;

function rig() {
  const g = new TileGrid(40, 40);
  g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => TERRAIN.grass));
  const world = new World();
  const sp = new Spawner(world, new Rng(12));
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const abilities = new AbilitySystem(world, new EffectSystem(world), strikes, new Rng(1));
  const shots = new ProjectileSystem(world, strikes, new Collision(g), new Rng(2));
  const zoro = sp.spawnUnit('unit.zoroAdvanced', 300, 300);
  const ronin = sp.spawnUnit('unit.ronin', 700, 300);
  return { world, sp, abilities, shots, zoro, ronin };
}
/** Two shots flying at each other along y = 300, `gap` apart, each at `speed` — they meet this tick when gap ≤ r+r+2·speed·dt. */
function loose(world: World, owner: Entity, x: number, dir: 1 | -1, kind: 'ball' | 'slash', rung: number | undefined, r = 12): Entity {
  return world.create({
    transform: { x, y: 300, angle: dir > 0 ? 0 : Math.PI, r },
    projectile: { owner: owner.id, ability: 'ability.poundSlash', vx: dir * 400, vy: 0, life: 1, hit: [], kind, rung, scale: 1 },
  });
}
const alive = (world: World, e: Entity): boolean => world.byId(e.id)?.projectile !== undefined;

describe('the class rule at the same rung', () => {
  it('a slash cuts a ball and flies on; two slashes burst each other; two balls drop each other', () => {
    const { world, shots, zoro, ronin } = rig();
    const T = effectiveTier(zoro)!;
    const s1 = loose(world, zoro, 490, 1, 'slash', T);
    const b1 = loose(world, ronin, 510, -1, 'ball', T);
    shots.update(SIM);
    expect(alive(world, s1)).toBe(true);
    expect(alive(world, b1)).toBe(false);
    const s2 = loose(world, zoro, 190, 1, 'slash', T);
    const s3 = loose(world, ronin, 210, -1, 'slash', T);
    shots.update(SIM);
    expect(alive(world, s2)).toBe(false);
    expect(alive(world, s3)).toBe(false);
    const b2 = loose(world, zoro, 90, 1, 'ball', T);
    const b3 = loose(world, ronin, 110, -1, 'ball', T);
    shots.update(SIM);
    expect(alive(world, b2)).toBe(false);
    expect(alive(world, b3)).toBe(false);
  });
});

describe('the ladder decides first', () => {
  it('a letter up (a coated shooter\'s rung) erases the other shot whatever its class, and flies on untouched', () => {
    const { world, shots, zoro, ronin } = rig();
    const T = effectiveTier(ronin)!;
    const coatedBall = loose(world, ronin, 510, -1, 'ball', T + letters(1)); // a ball loosed under the coating
    const slash = loose(world, zoro, 490, 1, 'slash', T);
    const bursts: number[] = [];
    const off = events.on('fx:burst', (f) => { bursts.push(f.n); });
    shots.update(SIM);
    off();
    expect(alive(world, coatedBall)).toBe(true); // the ladder beats the class rule
    expect(alive(world, slash)).toBe(false);
    expect(bursts.length).toBeGreaterThan(0);
    const t2 = world.byId(coatedBall.id)!.transform!;
    expect(t2.x).toBeLessThan(510); // it kept flying
  });

  it('a tier-less shot meets anything as an equal; shots of friends or of one shooter never duel', () => {
    const { world, shots, zoro, ronin } = rig();
    const T = effectiveTier(zoro)!;
    const noRung = loose(world, ronin, 510, -1, 'slash', undefined);
    const slash = loose(world, zoro, 490, 1, 'slash', T);
    shots.update(SIM);
    expect(alive(world, noRung)).toBe(false);
    expect(alive(world, slash)).toBe(false); // equals: both burst
    const mine1 = loose(world, zoro, 190, 1, 'slash', T);
    const mine2 = loose(world, zoro, 210, -1, 'slash', T); // one shooter's two slashes crossing
    shots.update(SIM);
    expect(alive(world, mine1)).toBe(true);
    expect(alive(world, mine2)).toBe(true);
  });
});

describe('the stamp at fire', () => {
  it('a fired shot carries its class from the look and the shooter\'s effective rung, coating included', () => {
    const { world, abilities, zoro } = rig();
    applyEffect(zoro, 'effect.armament', 'test');
    const before = world.with('projectile').length;
    expect(abilities.activate(zoro, 'ability.nanajuniPound')).toBe(true); // volleys two flying slashes at its cues
    const m = zoro.melee!;
    m.t = m.dur * 0.6; // past both cues (0.5, 0.56)
    abilities.update(SIM);
    const fired = world.with('projectile').slice(before);
    expect(fired.length).toBe(2);
    for (const p of fired) {
      expect(p.projectile.kind).toBe('slash');
      expect(p.projectile.rung).toBe(effectiveTier(zoro)); // +1 letter while coated
      expect(p.projectile.theme).toBe('haki');
    }
  });
});
