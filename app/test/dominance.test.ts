import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { ARMAMENT_DOMINANCE, DOMINANCE_LADDER, dominance, effectiveTier, NEUTRAL_GAP, REBOUND_STUN } from '../src/combat/dominance';
import { applyEffect, Effects } from '../src/combat/Effect';
import { equip } from '../src/combat/equip';
import { tryGuard, WEIGHT_POSTURE } from '../src/combat/guard';
import { letters, tierIndex, type PowerTier } from '../src/combat/PowerTier';
import { events } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Units } from '../src/defs/units';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

const SLASH = Abilities.get('ability.swordSlash1');
const staggered = (e: Entity) => e.effects!.active.find((a) => a.id === 'effect.staggered');

/** HP a landed sword hit takes off a same-letter defender — the ladder must never change this number. */
function neutralLoss(): number {
  const { attacker, defender, strikes } = pair('D-', 'D-');
  const hp0 = defender.health!.hp;
  strikes.hit(attacker, defender, SLASH, 10, 100, 0, 0, 0.5);
  return hp0 - defender.health!.hp;
}

/** Two sworded humans squared up: the attacker 30px east, the defender facing it (inside its guard arc). The
 *  nameplate tiers are set directly — the ladder reads identity.tier, and a tier is just data on the unit. */
function pair(attackerTier: PowerTier, defenderTier: PowerTier) {
  const world = new World();
  const sp = new Spawner(world, new Rng(3));
  const attacker = sp.spawnUnit('unit.thug', 30, 0);
  const defender = sp.spawnUnit('unit.soldier', 0, 0); // a different faction (hostile pair)
  for (const [e, tier] of [[attacker, attackerTier], [defender, defenderTier]] as const) {
    e.identity!.tier = tier;
    equip(e, 'weapon', 'weapon.sword'); // armed → may parry
  }
  defender.transform!.angle = 0;
  attacker.transform!.angle = Math.PI;
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const swing = (e: Entity) => (e.melee = { ability: SLASH.id, t: 0.1, dur: 0.8, motion: 'arc', phases: { windup: 0.5, active: 0.2, recover: 0.3 }, side: 1, angle: Math.PI, hitByVolume: [] });
  return { world, attacker, defender, strikes, swing };
}

describe('the ladder is data, validated like a registry', () => {
  it('rungs ascend from gap 0, one letter apart by default — authored in letters(), so the band granularity lives in one place', () => {
    expect(letters(1)).toBe(3);
    expect(DOMINANCE_LADDER.map((r) => r.gap)).toEqual([0, letters(1), letters(2), letters(3)]);
    expect(ARMAMENT_DOMINANCE).toBe(letters(1));
    expect(DOMINANCE_LADDER[0]!.up).toBe(NEUTRAL_GAP);
  });

  it('a same-letter clash changes nothing; a unit without a tier is judged neutral (a ship, a structure)', () => {
    const { attacker, defender } = pair('D-', 'D+');
    expect(dominance(attacker, defender)).toBe(NEUTRAL_GAP);
    delete defender.identity;
    expect(dominance(attacker, defender)).toBe(NEUTRAL_GAP);
  });

  it('the gap picks the rung AND the side: the same two fighters, opposite rules', () => {
    const { attacker, defender } = pair('D-', 'C-'); // 3 bands
    expect(dominance(attacker, defender).stunMul).toBe(0.5); // hitting UP: he flinches half as much
    expect(dominance(defender, attacker).stunMul).toBe(1.25); // hitting DOWN: you stagger longer
    expect(dominance(attacker, defender).interrupts).toBe(true); // one letter: a windup can still be clipped
  });

  it('two letters: poise, no clip, a parry from below only blocks, a dominant block rebounds', () => {
    const { attacker, defender } = pair('D-', 'B-'); // 6 bands
    const up = dominance(attacker, defender);
    expect(up.stunMul).toBe(0);
    expect(up.knockbackMul).toBe(0);
    expect(up.interrupts).toBe(false);
    expect(up.rebound).toBe('block');
    expect(dominance(defender, attacker).parryDeflects).toBe(false); // the lower's parry can't turn his steel
  });

  it('three letters: any landed hit rebounds — striking stone', () => {
    const { attacker, defender } = pair('D-', 'A-'); // 9 bands
    expect(dominance(attacker, defender).rebound).toBe('hit');
    expect(dominance(attacker, defender).postureMul).toBe(0);
  });
});

describe('the EFFECTIVE tier — Armament lifts the wearer one letter for the coating', () => {
  it('effect.armament adds ARMAMENT_DOMINANCE bands through the stat pipe, and expires with the effect', () => {
    const { world, attacker, defender } = pair('D-', 'C-'); // 3 bands apart on the nameplate
    expect(effectiveTier(defender)).toBe(tierIndex('C-'));
    applyEffect(defender, 'effect.armament', 'test');
    expect(effectiveTier(defender)).toBe(tierIndex('C-') + ARMAMENT_DOMINANCE);
    expect(dominance(attacker, defender).interrupts).toBe(false); // now TWO letters: his windup is beyond your reach
    const fx = new EffectSystem(world);
    const ticks = Math.ceil((Effects.get('effect.armament').durationSec + 1) * 60);
    for (let i = 0; i < ticks; i++) fx.update(1 / 60); // a second past the coating's authored life
    expect(effectiveTier(defender)).toBe(tierIndex('C-')); // the stat left with its source
    expect(dominance(attacker, defender).interrupts).toBe(true);
  });
});

describe('the clash readout — one typed event per tiered hit, with the rung and the outcome', () => {
  it('a blocked hit from two letters below reports gap −6, the up-rule, and the rebound', () => {
    const { attacker, defender, strikes, swing } = pair('D-', 'B-');
    const seen: { gap: number; outcome: string; parry: boolean }[] = [];
    const off = events.on('combat:clash', ({ gap, rule, outcome }) => seen.push({ gap, outcome, parry: rule.parryDeflects }));
    tryGuard(defender, false);
    swing(attacker); // a CONTACT hit is a blade IN HAND — the rebound rule reads the striker's live swing (a ground zone ticking the same row is not contact)
    strikes.hit(attacker, defender, SLASH, 10, 100, 0, 0, 0.5);
    swing(defender);
    strikes.hit(defender, attacker, SLASH, 10, -100, 0, 0, 0.5);
    off();
    expect(seen).toEqual([
      { gap: -letters(2), outcome: 'rebound', parry: true },
      { gap: letters(2), outcome: 'landed', parry: false },
    ]);
  });
});

describe('StrikeResolver reads the rung once and the hit obeys it', () => {
  it('hitting two letters up: the blow lands, but he neither flinches nor moves', () => {
    const { attacker, defender, strikes } = pair('D-', 'B-');
    const hp0 = defender.health!.hp;
    expect(strikes.hit(attacker, defender, SLASH, 10, 100, 0, 0, 0.5)).toBe(true);
    expect(hp0 - defender.health!.hp).toBe(neutralLoss()); // damage is NOT the ladder's business (the tier curves own it)
    expect(staggered(defender)).toBeUndefined(); // poise
    expect(defender.mover!.dvx).toBe(0); // no shove
  });

  it('hitting two letters up into his BLOCK: the blade bounces — the attacker staggers and loses the swing', () => {
    const { attacker, defender, strikes, swing } = pair('D-', 'B-');
    expect(tryGuard(defender, false)).toBe(true);
    swing(attacker);
    expect(strikes.hit(attacker, defender, SLASH, 10, 100, 0, 0, 0.5)).toBe(false);
    expect(staggered(attacker)?.remaining).toBeCloseTo(REBOUND_STUN, 5);
    expect(attacker.melee).toBeUndefined();
    expect(defender.combatant!.posture).toBeGreaterThan(0); // the quarter-posture still registers
  });

  it('a parry from two letters below does not deflect: the window BLOCKS instead, the big man keeps swinging', () => {
    const { attacker, defender, strikes, swing } = pair('D-', 'B-');
    swing(defender); // the dominant fighter mid-windup…
    attacker.combatant!.maxPosture = 100; // raised so the block HOLDS — this test is about the deflect, not the break (×2 posture breaks a stock guard outright)
    expect(tryGuard(attacker, true)).toBe(true); // …the lesser one opens a parry window, facing him
    expect(attacker.combatant!.parryT).toBeGreaterThan(0);
    expect(strikes.hit(defender, attacker, SLASH, 10, -100, 0, 0, 0.5)).toBe(false); // stopped — but as a BLOCK
    expect(staggered(defender)).toBeUndefined(); // no parry punish on him
    expect(defender.melee).toBeDefined(); // his swing was not interrupted
    expect(attacker.combatant!.posture).toBe(WEIGHT_POSTURE.heavy * 2); // the blocker paid posture — ×2, the dominant rung's crush
  });

  it('a TAPPED parry from two letters below (key released, window ticking) still blocks — the arms are up', () => {
    const { attacker, defender, strikes, swing } = pair('D-', 'B-');
    swing(defender);
    attacker.combatant!.maxPosture = 100;
    expect(tryGuard(attacker, true)).toBe(true);
    attacker.combatant!.blocking = false; // the tap: F released the next frame, parryT keeps ticking (InputSystem.endGuard)
    expect(attacker.combatant!.parryT).toBeGreaterThan(0);
    expect(strikes.hit(defender, attacker, SLASH, 10, -100, 0, 0, 0.5)).toBe(false); // blocked, not eaten clean
    expect(attacker.combatant!.posture).toBe(WEIGHT_POSTURE.heavy * 2);
  });

  it('hitting three letters up: it lands AND the attacker rebounds off him', () => {
    const { attacker, defender, strikes, swing } = pair('D-', 'A-');
    swing(attacker);
    const hp0 = defender.health!.hp;
    expect(strikes.hit(attacker, defender, SLASH, 10, 100, 0, 0, 0.5)).toBe(true);
    expect(hp0 - defender.health!.hp).toBe(neutralLoss()); // it still bleeds him — the floor #16 promises
    expect(staggered(attacker)?.remaining).toBeCloseTo(REBOUND_STUN, 5);
    expect(attacker.melee).toBeUndefined();
  });

  it('a BALL from three letters below never rebounds its shooter — the rebound is a contact rule', () => {
    const { attacker, defender, strikes } = pair('D-', 'A-');
    const shot = Abilities.get('ability.musketShot');
    expect(strikes.hit(attacker, defender, shot, 10, 100, 0, 0, 0.5)).toBe(true);
    expect(staggered(attacker)).toBeUndefined(); // he's across the yard — nothing to bounce off
    expect(tryGuard(defender, false)).toBe(true);
    expect(strikes.hit(attacker, defender, shot, 10, 100, 0, 0, 0.5)).toBe(false); // blocked…
    expect(staggered(attacker)).toBeUndefined(); // …and still no rebound
  });

  it('a wall-slam proc obeys the rung too: half the shove and pin from one letter below, none from two', () => {
    const slam = { ...SLASH, wallSlam: { chance: 1, knockback: 900, stun: 3, slow: 1.5 } }; // a synthetic always-proc Buttstroke
    const shove = (a: PowerTier, d: PowerTier): { dvx: number; pin: number } => {
      const { attacker, defender, strikes } = pair(a, d);
      strikes.hit(attacker, defender, slam, 10, 100, 0, 0, 0.5);
      return { dvx: defender.mover!.dvx, pin: defender.mover!.slamStun ?? 0 };
    };
    const same = shove('D-', 'D-');
    expect(same.dvx).toBeCloseTo(900, 5);
    expect(same.pin).toBe(3);
    const up1 = shove('D-', 'C-');
    expect(up1.dvx).toBeCloseTo(450, 5); // the slam REPLACES the knockback, so it carries the rung's half, not the full 900
    expect(up1.pin).toBeCloseTo(1.5, 5);
    const up2 = shove('D-', 'B-');
    expect(up2.dvx).toBe(0); // poise: not shoved, not pinned
    expect(up2.pin).toBe(0);
  });

  it('hitting one letter down: the stagger is longer (×1.25)', () => {
    const { attacker, defender, strikes } = pair('C-', 'D-');
    expect(strikes.hit(attacker, defender, SLASH, 10, 100, 0, 0, 0.4)).toBe(true);
    expect(staggered(defender)?.remaining).toBeCloseTo(0.5, 5);
  });
});

describe('a tier is boot-validated, so the ladder never meets a band it cannot place', () => {
  it('the Units validator rejects a tier outside F- … X+ (last: a bad row poisons later lookups in this file)', () => {
    Units.register({ id: 'unit.testBadTier', name: 'x', tier: 'Z' as never, faction: 'bandits', aiProfile: 'ai.rusher' });
    expect(() => Units.get('unit.testBadTier')).toThrow(/not a power tier/);
  });
});
