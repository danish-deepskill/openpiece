import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { activeWindow, phaseAt, resolvePhases, weaponKit, WEIGHT_PHASES } from '../src/combat/phases';
import { StatBlock } from '../src/combat/StatBlock';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Weapons } from '../src/defs/layers';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MeleeSystem } from '../src/systems/MeleeSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

const cutlassed = { equipment: { weapon: 'weapon.cutlass', potentials: [] } } as unknown as Entity;
const sworded = { equipment: { weapon: 'weapon.sword', potentials: [] } } as unknown as Entity;

describe('WEIGHT_PHASES — heavier means a longer, more readable windup', () => {
  it('every rung sums to 1 and windup climbs unarmed → light → medium → heavy', () => {
    for (const ph of Object.values(WEIGHT_PHASES)) {
      expect(ph.windup + ph.active + ph.recover).toBeCloseTo(1, 10);
    }
    expect(WEIGHT_PHASES.unarmed.windup).toBeLessThan(WEIGHT_PHASES.light.windup);
    expect(WEIGHT_PHASES.light.windup).toBeLessThan(WEIGHT_PHASES.medium.windup);
    expect(WEIGHT_PHASES.medium.windup).toBeLessThan(WEIGHT_PHASES.heavy.windup);
  });
});

describe('resolvePhases — the kit rule (a sheathed sword cannot slow your kick)', () => {
  it('a punch stays UNARMED-fast even while a weapon is equipped', () => {
    expect(resolvePhases(cutlassed, Abilities.get('ability.punch'))).toBe(WEIGHT_PHASES.unarmed);
    expect(resolvePhases(cutlassed, Abilities.get('ability.kick'))).toBe(WEIGHT_PHASES.unarmed);
  });

  it("a weapon's OWN kit inherits its class rung (cutlass → medium, sword chain → heavy)", () => {
    expect(resolvePhases(cutlassed, Abilities.get('ability.cut'))).toBe(WEIGHT_PHASES.medium);
    expect(resolvePhases(sworded, Abilities.get('ability.swordSlash1'))).toBe(WEIGHT_PHASES.heavy);
    expect(resolvePhases(sworded, Abilities.get('ability.swordFinisher'))).toBe(WEIGHT_PHASES.heavy); // via comboNext
  });

  it('fruit abilities keep their AUTHORED clock regardless of what is sheathed', () => {
    expect(resolvePhases(sworded, Abilities.get('ability.gomuPistol')).windup).toBeCloseTo(0.36);
  });

  it('weaponKit walks the combo chain', () => {
    const kit = weaponKit(Weapons.get('weapon.sword'));
    expect(kit.has('ability.swordSlash1')).toBe(true);
    expect(kit.has('ability.swordFinisher')).toBe(true);
    expect(kit.has('ability.punch')).toBe(false);
  });

  it('no authored hit window opens before its swing\'s windup ends (a telegraph must never damage)', () => {
    // sweeps every registered ability whose volumes carry explicit windows against its resolved clock
    for (const a of Abilities.all()) {
      const vols = a.shape?.hitVolumes;
      if (!vols) continue;
      const windup = (a.shape?.phases ?? WEIGHT_PHASES.heavy).windup; // heavy = the widest default rung
      for (const v of vols) {
        if (v.active) expect(v.active[0], `${a.id} window opens mid-windup`).toBeGreaterThanOrEqual(Math.min(windup, 0.38));
      }
    }
  });
});

describe('phaseAt / activeWindow — the one shared clock', () => {
  const ph = { windup: 0.3, active: 0.4, recover: 0.3 };
  it('names the region at any progress', () => {
    expect(phaseAt(ph, 0.1)).toBe('windup');
    expect(phaseAt(ph, 0.3)).toBe('active'); // boundary belongs to the later phase
    expect(phaseAt(ph, 0.69)).toBe('active');
    expect(phaseAt(ph, 0.7)).toBe('recover');
  });
  it('activeWindow is the default hit window', () => {
    expect(activeWindow(ph)).toEqual([0.3, 0.7]);
  });
});

describe('the hitbox is DEAD outside the active phase', () => {
  Abilities.register({
    id: 'ability.testPhased',
    name: 'Phased',
    cooldown: 1,
    damageStat: 'atk',
    shape: { range: 0, arc: 0.3, swing: 'melee', swingTime: 1, phases: { windup: 0.4, active: 0.2, recover: 0.4 } },
  });

  it('a lingering target is hit exactly once, and only once the windup ends', () => {
    const world = new World();
    const attacker = world.create({
      transform: { x: 0, y: 0, angle: 0, r: 12 },
      faction: { id: 'bandits' },
      attributes: new StatBlock({ atk: 5, reach: 34 }),
      combatant: { stam: 100, maxStam: 100, combo: 0, comboT: 0 },
      melee: { ability: 'ability.testPhased', t: 0, dur: 1, motion: 'stab', phases: { windup: 0.4, active: 0.2, recover: 0.4 }, side: 1, angle: 0, hitByVolume: [] },
    });
    world.create({
      transform: { x: 12, y: 0, angle: 0, r: 25 }, // huge + overlapping the fist for the WHOLE swing
      faction: { id: 'civilians' },
      health: { hp: 100, maxHp: 100, dead: false, hitFlash: 0, iframes: 0 },
    });
    const ms = new MeleeSystem(world, new StrikeResolver(new Damage()));
    for (let i = 0; i < 3; i++) ms.update(0.1); // p → 0.3: still winding up
    expect(attacker.combatant!.combo).toBe(0); // the tell deals NO damage
    ms.update(0.1); // p = 0.4: the active phase opens
    expect(attacker.combatant!.combo).toBe(1); // the strike lands
    for (let i = 0; i < 6; i++) ms.update(0.1); // through recovery to the end
    expect(attacker.combatant!.combo).toBe(1); // the follow-through deals NO damage either
  });
});

describe('a dodge buys OUT of a swing in flight', () => {
  it('activating the dodge mid-swing forfeits the attack (no portable hitbox)', () => {
    const world = new World();
    const hero = new Spawner(world, new Rng(3)).spawnHero(0, 0);
    // strikes stubbed: neither punch (melee) nor dodge (self-impulse) consults the resolver at activation
    const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(3));
    expect(abilities.activate(hero, 'ability.punch')).toBe(true);
    expect(hero.melee).toBeDefined();
    expect(abilities.activate(hero, 'ability.dodge')).toBe(true);
    expect(hero.melee).toBeUndefined(); // the swing is gone — commitment escaped, attack forfeited
  });
});
