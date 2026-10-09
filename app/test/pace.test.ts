import { describe, expect, it } from 'vitest';
import type { AIContext } from '../src/ai/Brain';
import { tryPace } from '../src/ai/brains';
import { Abilities, abilityProblem, type AbilityDef } from '../src/combat/Ability';
import { Effects, TAG_PACE_CONSERVE, TAG_PACE_PUSH } from '../src/combat/Effect';
import { spendStamina, stamCostOf } from '../src/combat/stamina';
import { STAM_REGEN, STAM_REGEN_DELAY } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { CombatantSystem } from '../src/systems/CombatantSystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

function rig(unit = 'unit.ronin') {
  const world = new World();
  const e = new Spawner(world, new Rng(1)).spawnUnit(unit, 0, 0);
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));
  return { world, e, c: e.combatant!, abilities, combatants: new CombatantSystem(world), ctx: { abilities } as unknown as AIContext };
}
const PACE = 'ability.pace';
const mode = (e: { tags?: { has(t: string): boolean } }) => (e.tags!.has(TAG_PACE_PUSH) ? 'push' : e.tags!.has(TAG_PACE_CONSERVE) ? 'conserve' : 'normal');

describe('the pace — one key, a cycle of stances', () => {
  it('the swordsmen carry it on the stance key (Z); fodder has no stance', () => {
    expect(rig('unit.ronin').e.loadout!.stance).toBe(PACE);
    expect(rig('unit.samurai').e.loadout!.stance).toBe(PACE);
    expect(rig('unit.thug').e.loadout!.stance).toBeUndefined();
    expect(rig('unit.ronin').e.loadout!.utilities).toEqual(['ability.armament', 'ability.kiaiElite']); // C and X untouched
  });

  it('Z cycles normal → push → conserve → normal, free and instant', () => {
    const { e, abilities, c } = rig();
    const stam = c.stam;
    expect(mode(e)).toBe('normal');
    expect(abilities.activate(e, PACE)).toBe(true);
    expect(mode(e)).toBe('push');
    expect(abilities.activate(e, PACE)).toBe(true);
    expect(mode(e)).toBe('conserve');
    expect(e.tags!.has(TAG_PACE_PUSH)).toBe(false); // one pace at a time
    expect(abilities.activate(e, PACE)).toBe(true);
    expect(mode(e)).toBe('normal');
    expect(c.stam).toBe(stam); // no cost
    expect(e.loadout!.cd.get(PACE) ?? 0).toBe(0); // no cooldown
  });

  it('the validator keeps a cycle a pure state switch', () => {
    const base = { id: 'ability.testCycle', name: 'x', cooldown: 0 } as AbilityDef;
    expect(abilityProblem({ ...base, cycle: [] })).toMatch(/cycle needs/);
    expect(abilityProblem({ ...base, cycle: ['effect.secondWind'], grantEffect: 'effect.kiai' })).toMatch(/cycle needs/);
    expect(abilityProblem({ ...base, cycle: ['effect.secondWind'] })).toBeNull();
  });
});

describe('the trade: breath now vs the day', () => {
  it('SECOND WIND: half-price actions, half the pause, regen ×1.5, each spend booked at ×1.5 wear, rest recovery ×0.5', () => {
    const push = rig();
    const plain = rig();
    push.abilities.cycleTo(push.e, PACE, 'effect.secondWind');
    expect(stamCostOf(push.e, 30)).toBe(15); // half price
    expect(stamCostOf(plain.e, 30)).toBe(30);
    const cut = Abilities.get('ability.shukuchiGiri').costStam!; // the Ronin's own opener
    const s0 = push.c.stam;
    expect(push.abilities.activate(push.e, 'ability.shukuchiGiri')).toBe(true);
    expect(s0 - push.c.stam).toBeCloseTo(cut * 0.5, 6); // the discount is what leaves the bar
    expect(push.c.regenT).toBeCloseTo(STAM_REGEN_DELAY * 0.5, 6); // the shorter pause
    expect(push.c.vigor ?? 1).toBe(1); // spending is free for the day…
    expect(push.c.vigorDebt!).toBeGreaterThan(0); // …but the PRICE is booked now: the full effort × the push's ×1.5
    plain.abilities.activate(plain.e, 'ability.shukuchiGiri'); // the same swing at normal pace
    expect(push.c.vigorDebt!).toBeCloseTo(plain.c.vigorDebt! * 1.5, 6); // charged on the FULL cost, not the discounted one
    push.c.regenT = 0; plain.c.regenT = 0;
    { const p0 = push.c.stam; const n0 = plain.c.stam; push.combatants.update(1 / 60); plain.combatants.update(1 / 60); expect(push.c.stam - p0).toBeCloseTo((plain.c.stam - n0) * 1.5, 4); } // 36/s vs 24/s
    for (let i = 0; i < 60 * 5; i++) { push.combatants.update(1 / 60); plain.combatants.update(1 / 60); } // breath back
    expect(1 - push.c.vigor!).toBeCloseTo((1 - plain.c.vigor!) * 1.5, 1); // the day paid ×1.5 for the pushed swing (a few seconds of rest recovery blur the last digit)
    expect(push.c.vigorDebt).toBe(0);
  });

  it('a push lifts the WILL trickle a little (×1.25) — never the coating\'s drain', () => {
    const push = rig();
    const plain = rig();
    push.abilities.cycleTo(push.e, PACE, 'effect.secondWind');
    for (const r of [push, plain]) { r.c.will = 0; r.c.willRegenT = 0; }
    push.combatants.update(1 / 60); plain.combatants.update(1 / 60);
    const lift = 1 + Effects.get('effect.secondWind').modifiers!.find((m) => m.stat === 'willRegenMul')!.value; // whatever the row says (a test value may sit there)
    expect(push.c.will!).toBeCloseTo(plain.c.will! * lift, 6);
    expect(Effects.get('effect.secondWind').modifiers!.some((m) => m.stat === 'drainWillPerSec')).toBe(false);
  });

  it('REST recovery follows the pace: a push can\'t rest (×0.5), a measured breath rests better (×1.5)', () => {
    const rates: Record<string, number> = {};
    for (const [name, target] of [['normal', undefined], ['push', 'effect.secondWind'], ['conserve', 'effect.measuredBreath']] as const) {
      const r = rig();
      if (target) r.abilities.cycleTo(r.e, PACE, target);
      r.c.vigor = 0.5; r.c.vigorDebt = 0; r.c.regenT = 0;
      r.c.stam = r.c.maxStam; // the breath is back: pure rest
      const v0 = r.c.vigor;
      for (let i = 0; i < 60 * 10; i++) r.combatants.update(1 / 60);
      rates[name] = r.c.vigor! - v0;
    }
    expect(rates.push!).toBeCloseTo(rates.normal! * 0.5, 4);
    expect(rates.conserve!).toBeCloseTo(rates.normal! * 1.5, 4);
  });

  it('the pace-flip exploit is closed: exert under Second Wind, switch to Measured Breath, refill — you still pay the push\'s price', () => {
    const cheat = rig();
    const honest = rig();
    cheat.abilities.cycleTo(cheat.e, PACE, 'effect.secondWind');
    cheat.abilities.activate(cheat.e, 'ability.shukuchiGiri');
    cheat.abilities.cycleTo(cheat.e, PACE, 'effect.measuredBreath'); // flip before the refill
    honest.abilities.cycleTo(honest.e, PACE, 'effect.secondWind');
    honest.abilities.activate(honest.e, 'ability.shukuchiGiri');
    cheat.c.regenT = 0; honest.c.regenT = 0;
    for (let i = 0; i < 60 * 8; i++) { cheat.combatants.update(1 / 60); honest.combatants.update(1 / 60); }
    expect(cheat.c.vigor!).toBeCloseTo(honest.c.vigor!, 4); // the debt was booked at the push — the flip bought nothing
    // and the mirror: exert under a measured breath, flip to a push for the refill — you keep the thrift you earned
    const thrift = rig();
    thrift.abilities.cycleTo(thrift.e, PACE, 'effect.measuredBreath');
    thrift.abilities.activate(thrift.e, 'ability.shukuchiGiri');
    thrift.abilities.cycleTo(thrift.e, PACE, 'effect.secondWind');
    thrift.c.regenT = 0;
    for (let i = 0; i < 60 * 8; i++) thrift.combatants.update(1 / 60);
    expect(1 - thrift.c.vigor!).toBeCloseTo((1 - honest.c.vigor!) * (0.3 / 1.5), 4);
  });

  it('MEASURED BREATH: regen ×0.6, each refilled point wears ×0.3, and vigor mends even while the regen pause is running', () => {
    const slow = rig();
    slow.abilities.cycleTo(slow.e, PACE, 'effect.measuredBreath');
    const plain = rig();
    expect(stamCostOf(slow.e, 30)).toBe(30); // full price
    slow.c.vigor = 0.8; plain.c.vigor = 0.8;
    spendStamina(slow.c, 30, slow.e); spendStamina(plain.c, 30, plain.e);
    expect(slow.c.vigorDebt!).toBeCloseTo(plain.c.vigorDebt! * 0.3, 6); // booked at a third of the wear
    const v0 = slow.c.vigor!;
    slow.combatants.update(1 / 60); // regenT > 0: still "fighting"
    expect(slow.c.vigor!).toBeGreaterThan(v0); // mends anyway (half rate)
    const pv0 = plain.c.vigor!;
    plain.combatants.update(1 / 60);
    expect(plain.c.vigor).toBe(pv0); // normal pace: no mending under pressure
    slow.c.regenT = 0; plain.c.regenT = 0;
    const s0 = slow.c.stam; const n0 = plain.c.stam;
    slow.combatants.update(1 / 60); plain.combatants.update(1 / 60);
    expect(slow.c.stam - s0).toBeCloseTo((plain.c.stam - n0) * 0.6, 4); // slower refill
  });
});

describe('the brain picks a pace', () => {
  it('the SAMURAI pushes on stamina: conserve while regrouping, push when the bar runs low under pressure, normal otherwise; idempotent', () => {
    const { e, c, ctx } = rig('unit.samurai'); // pushBelowStam 0.3
    tryPace(e, ctx, 0.9, false);
    expect(mode(e)).toBe('normal');
    tryPace(e, ctx, 0.2, false); // low, engaged
    expect(mode(e)).toBe('push');
    tryPace(e, ctx, 0.2, false);
    expect(mode(e)).toBe('push'); // no re-press (cycleTo is a no-op when already there)
    tryPace(e, ctx, 0.2, true); // backing off
    expect(mode(e)).toBe('conserve');
    tryPace(e, ctx, 0.8, false); // recovered
    expect(mode(e)).toBe('normal');
    // HYSTERESIS: once pushing, the push's own regen lifting the bar just over the line must not flip it back
    tryPace(e, ctx, 0.2, false);
    expect(mode(e)).toBe('push');
    tryPace(e, ctx, 0.35, false); // over the 0.3 line, inside the band
    expect(mode(e)).toBe('push');
    tryPace(e, ctx, 0.45, false); // still inside (0.3 + 0.2)
    expect(mode(e)).toBe('push');
    tryPace(e, ctx, 0.55, false); // past the band: back to normal
    expect(mode(e)).toBe('normal');
    void c;
  });

  it('the DUELISTS push on danger: normal by default, Second Wind once HP is at 60% or under, whatever the bar says', () => {
    for (const unit of ['unit.ronin', 'unit.zoroAdvanced']) {
      const { e, ctx } = rig(unit);
      expect(e.ai!.bb.profile.pushBelowHp).toBe(0.6);
      expect(e.ai!.bb.profile.pushBelowStam).toBeUndefined(); // stamina alone never moves them
      tryPace(e, ctx, 0.2, false, 1); // bar empty, health full → still normal
      expect(mode(e)).toBe('normal');
      tryPace(e, ctx, 0.9, false, 0.6); // the fight turns
      expect(mode(e)).toBe('push');
      tryPace(e, ctx, 0.9, true, 0.6); // backing off: conserve wins even when hurt
      expect(mode(e)).toBe('conserve');
      tryPace(e, ctx, 0.9, false, 0.9); // healed (or a test's fiat): back to normal
      expect(mode(e)).toBe('normal');
    }
  });

  it('a unit without the knob never touches its stance; one without a stance is untouched', () => {
    const samurai = rig('unit.samurai');
    expect(samurai.e.ai!.bb.profile.pushBelowStam).toBe(0.3);
    const thug = rig('unit.thug');
    tryPace(thug.e, thug.ctx, 0.1, false);
    expect(mode(thug.e)).toBe('normal');
    const r = rig();
    r.e.ai!.bb.profile = { ...r.e.ai!.bb.profile, pushBelowStam: undefined, pushBelowHp: undefined };
    tryPace(r.e, r.ctx, 0.1, false, 0.1);
    expect(mode(r.e)).toBe('normal');
    expect(Abilities.get(PACE).cycle).toEqual(['effect.secondWind', 'effect.measuredBreath']);
  });
});
