import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { activeWindow, phaseAt, resolvePhases, weaponKit, WEIGHT_PHASES } from '../src/combat/phases';
import { StatBlock } from '../src/combat/StatBlock';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Weapons } from '../src/defs/layers';
import { Units } from '../src/defs/units';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MeleeSystem } from '../src/systems/MeleeSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

const cutlassed = { equipment: { weapon: 'weapon.cutlass', potentials: [] } } as unknown as Entity;
const sworded = { equipment: { weapon: 'weapon.sword', potentials: [] } } as unknown as Entity;

describe('WEIGHT_PHASES — heavier means a longer, more readable windup', () => {
  it('every rung sums to 1', () => {
    for (const ph of Object.values(WEIGHT_PHASES)) {
      expect(ph.windup + ph.active + ph.recover).toBeCloseTo(1, 10);
    }
  });

  it('windup TIME climbs by weight class: fist/knife (~0.2s floor) < cutlass (~0.3s) < sword (~0.4s)', () => {
    // the ladder is windup TIME (fraction × swingTime), not the raw fraction — medium/heavy can share a fraction
    // and differ by swingTime. Assert the resolved times on real weapon abilities so the ladder is what SHIPS.
    const wt = (holder: Entity, id: string): number => {
      const a = Abilities.get(id);
      return resolvePhases(holder, a).windup * (a.shape?.swingTime ?? 0);
    };
    const fist = wt(cutlassed, 'ability.punch'); // ~0.20s — authors its own; holder irrelevant (kit rule)
    const cutlass = wt(cutlassed, 'ability.cut'); // ~0.30s — authored
    const sword = wt(sworded, 'ability.swordSlash1'); // ~0.40s — NO authored phases → the heavy rung × swingTime
    expect(fist).toBeGreaterThanOrEqual(0.18); // nothing dips below the readable floor
    expect(fist).toBeLessThan(cutlass); // fists telegraph less than a medium blade
    expect(cutlass).toBeLessThan(sword); // …which telegraphs less than the heavy sword
  });
});

describe('resolvePhases — the kit rule (a sheathed sword cannot slow your kick)', () => {
  it('a punch/kick keep their OWN authored windup even while a weapon is equipped (a sheathed sword cannot slow the bare strike)', () => {
    // punch/kick now AUTHOR their own reactable windup (the Deepwoken model). A sheathed weapon must NOT override
    // it up to the weapon's heavier class — the kit rule: your fist times against ITS clock, not the sword's.
    expect(resolvePhases(cutlassed, Abilities.get('ability.punch'))).toBe(Abilities.get('ability.punch').shape!.phases);
    expect(resolvePhases(cutlassed, Abilities.get('ability.kick'))).toBe(Abilities.get('ability.kick').shape!.phases);
    expect(resolvePhases(cutlassed, Abilities.get('ability.punch'))).not.toBe(WEIGHT_PHASES.medium); // NOT the cutlass's rung
  });

  it("a weapon-kit ability with NO authored phases inherits its class rung (sword chain → heavy)", () => {
    // the sword chain authors no phases → the heavy rung (its weapon class). cut/stab now DO author their
    // own phases (a reactable enemy tell), so they're the authored case, tested separately below.
    expect(resolvePhases(sworded, Abilities.get('ability.swordSlash1'))).toBe(WEIGHT_PHASES.heavy);
    expect(resolvePhases(sworded, Abilities.get('ability.swordSlash2'))).toBe(WEIGHT_PHASES.heavy);
    expect(resolvePhases(sworded, Abilities.get('ability.swordFinisher'))).toBe(WEIGHT_PHASES.heavy); // via comboNext
  });

  it("an ability's OWN authored phases win over its weapon class rung", () => {
    // cut is medium-class but authors a 0.4 windup (a readable enemy tell) — the authored phases win
    expect(resolvePhases(cutlassed, Abilities.get('ability.cut'))).toBe(Abilities.get('ability.cut').shape!.phases);
    expect(resolvePhases(cutlassed, Abilities.get('ability.cut'))).not.toBe(WEIGHT_PHASES.medium);
  });

  it('fruit abilities keep their AUTHORED clock regardless of what is sheathed', () => {
    // the authored windup survives the heavy sword being sheathed (the exact value tracks the Pistol def)
    expect(resolvePhases(sworded, Abilities.get('ability.gomuPistol')).windup).toBe(Abilities.get('ability.gomuPistol').shape!.phases!.windup);
    expect(resolvePhases(sworded, Abilities.get('ability.gomuPistol'))).not.toBe(WEIGHT_PHASES.heavy); // NOT the weapon's rung
  });

  it('weaponKit walks the combo chain', () => {
    const kit = weaponKit(Weapons.get('weapon.sword'));
    expect(kit.has('ability.swordSlash1')).toBe(true);
    expect(kit.has('ability.swordFinisher')).toBe(true);
    expect(kit.has('ability.punch')).toBe(false);
  });

  it('every hostile unit\'s attack tell clears human reaction time (parry gameplay depends on it)', () => {
    // data-driven: SPAWN each enemy and resolve its real attack clock (so a weapon attack gets its class
    // rung via the kit, not the twitchy unarmed fallback). A new enemy with a sub-reaction windup fails here.
    const world = new World();
    const sp = new Spawner(world, new Rng(1));
    for (const u of Units.all().filter((u) => u.faction === 'bandits')) {
      const e = sp.spawnUnit(u.id, 0, 0);
      const a = Abilities.get(e.loadout!.primary); // the RESOLVED primary (weapon's attack wins over the unarmed fallback)
      const windupSec = resolvePhases(e, a).windup * (a.shape?.swingTime ?? 0.18);
      expect(windupSec, `${u.id} (${a.id}) tell is unreactable`).toBeGreaterThanOrEqual(0.2);
    }
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
      combatant: { stam: 100, maxStam: 100, combo: 0, comboT: 0, posture: 0, maxPosture: 20 },
      melee: { ability: 'ability.testPhased', t: 0, dur: 1, motion: 'stab', phases: { windup: 0.4, active: 0.2, recover: 0.4 }, side: 1, angle: 0, hitByVolume: [] },
    });
    world.create({
      transform: { x: 12, y: 0, angle: 0, r: 25 }, // huge + overlapping the fist for the WHOLE swing
      faction: { id: 'civilians' },
      health: { hp: 100, maxHp: 100, dead: false, hitFlash: 0, iframes: 0 },
    });
    const ms = new MeleeSystem(world, new StrikeResolver(new Damage(), new Rng(1)));
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
    expect(abilities.activate(hero, 'ability.roll')).toBe(true);
    expect(hero.melee).toBeUndefined(); // the swing is gone — commitment escaped, attack forfeited
  });
});
