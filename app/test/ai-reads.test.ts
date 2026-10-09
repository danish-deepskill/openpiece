import { describe, expect, it } from 'vitest';
import type { AIContext } from '../src/ai/Brain';
import { dodgeDirection, foeOpen, guardChoice, holdFinisher, noteSwing, pickAttack, sidestep, situationalCloser, situationalPick } from '../src/ai/brains';
import { Abilities, AI_ROLE_FINISHER, AI_ROLE_GAP_CLOSER, AI_ROLE_GUARD_BREAK, AI_ROLE_RANGED } from '../src/combat/Ability';
import { applyEffect } from '../src/combat/Effect';
import { Rng } from '../src/core/Rng';
import { AIProfiles, aiProfileProblem, CRACKED_GUARD, FINISHER_HP } from '../src/defs/aiProfiles';
import { BASE_KIT } from '../src/defs/units';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * THE AI SLICE — the "tactical" rung as data: dodge the tell + punish the whiff, guard READS (the right guard, not a luckier
 * one), combo intent, specials for a reason. Every rule a knob or a row tag; the brain's structure untouched.
 */
function rig(seed = 2) {
  const world = new World();
  const sp = new Spawner(world, new Rng(seed));
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)); // contact never resolves here
  const ctx = { world, abilities, rng: new Rng(seed) } as unknown as AIContext; // the helpers read abilities + rng (+ world for byId)
  return { world, sp, abilities, ctx };
}
const ronin = AIProfiles.get('ai.ronin');
const zoro = AIProfiles.get('ai.zoro');
const thug = AIProfiles.get('ai.rusher');

describe('guardChoice — one roll, four outcomes, and the reads move shares instead of raising them', () => {
  it('without reads: parry | block | dodge | none by the weight\'s shares', () => {
    const p = { ...ronin, guardReads: false }; // heavy: parry 0.45, block 0.2, dodge 0.35 — exactly 1
    expect(guardChoice(p, 'heavy', true, 0, 0.1)).toBe('parry');
    expect(guardChoice(p, 'heavy', true, 0, 0.5)).toBe('block');
    expect(guardChoice(p, 'heavy', true, 0, 0.8)).toBe('dodge');
    expect(guardChoice(p, 'light', true, 0, 0.9)).toBe('none'); // light: parry 0.15 + block 0.2, no dodge
  });

  it('a blow that CAN\'T be parried spends the parry share on a dodge (else a block); a CRACKED guard spends the block share on a dodge', () => {
    expect(guardChoice(ronin, 'heavy', false, 0, 0.1)).toBe('block'); // parry 0 → block [0, 0.2), dodge [0.2, 1.0)
    expect(guardChoice(ronin, 'heavy', false, 0, 0.3)).toBe('dodge');
    expect(guardChoice(ronin, 'heavy', false, 0, 0.6)).toBe('dodge'); // the parry's 0.45 went to the dodge
    expect(guardChoice(ronin, 'heavy', true, CRACKED_GUARD, 0.5)).toBe('dodge'); // the block's 0.2 went to the dodge: [0.45, 1.0) dodges
    expect(guardChoice(ronin, 'heavy', true, CRACKED_GUARD, 0.4)).toBe('parry');
    const noDodge = { ...ronin, dodgeByWeight: undefined };
    expect(guardChoice(noDodge, 'heavy', false, 0, 0.5)).toBe('block'); // no dodge in the kit: the parry share becomes a block
    expect(guardChoice(noDodge, 'heavy', true, CRACKED_GUARD, 0.5)).toBe('parry'); // …and a cracked guard's block share a parry
    const blind = { ...ronin, guardReads: false };
    expect(guardChoice(blind, 'heavy', false, 0, 0.1)).toBe('parry'); // reads OFF: it still spends the parry on an unparryable blow (and eats it)
    expect(guardChoice(blind, 'heavy', true, 1, 0.5)).toBe('block'); // …and still blocks on a cracked guard
    expect(guardChoice(thug, 'heavy', false, 1, 0.99)).toBe('none'); // fodder: its small block share, then nothing
  });

  it('the validator keeps parry + block + dodge within one roll', () => {
    expect(aiProfileProblem(ronin)).toBeNull();
    expect(aiProfileProblem({ ...ronin, dodgeByWeight: { heavy: 0.5 } })).toMatch(/exceed 1/);
    expect(aiProfileProblem({ ...ronin, dodgeByWeight: { heavy: -0.1 } })).toMatch(/dodgeByWeight/);
  });
});

describe('the sidestep', () => {
  it('throws the base roll perpendicular to the foe, seeded left or right; refused mid-impulse or without the roll', () => {
    const { sp, ctx } = rig();
    const e = sp.spawnUnit('unit.ronin', 0, 0);
    const foe = sp.spawnUnit('unit.zoroAdvanced', 60, 0);
    expect(e.loadout!.granted.has(BASE_KIT.dash)).toBe(true); // the roll stays granted though Sandan owns Q
    expect(sidestep(e, ctx, foe)).toBe(true);
    expect(Math.abs(e.mover!.vx)).toBeLessThan(1e-6); // not toward him…
    expect(Math.abs(e.mover!.vy)).toBeGreaterThan(1); // …but across
    expect(e.mover!.dodgeT).toBeGreaterThan(0); // the roll fired
    expect(sidestep(e, ctx, foe)).toBe(false); // mid-impulse: no double step
    const v = sp.spawnUnit('unit.villager', 0, 100); // F: below the dash gate — no roll to step with
    expect(v.loadout!.granted.has(BASE_KIT.dash)).toBe(false);
    expect(sidestep(v, ctx, foe)).toBe(false);
  });
});

describe('which way to dodge — read off the blow', () => {
  it('a thrust or a lunge: step OFF the line (side); a sweep: step BACK out of reach — unless the roll would not clear it', () => {
    const { sp, abilities, ctx } = rig();
    const e = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    const foe = sp.spawnUnit('unit.ronin', 60, 0);
    expect(dodgeDirection(e, foe)).toBe('side'); // not swinging: nothing to read
    expect(abilities.activate(foe, 'ability.shukuchiZuki')).toBe(true); // the dash-thrust: a line (launchAt + 'line')
    expect(dodgeDirection(e, foe)).toBe('side');
    delete foe.melee;
    foe.loadout!.cd.clear();
    foe.loadout!.granted.add('ability.kesa');
    expect(abilities.activate(foe, 'ability.kesa')).toBe(true); // an arc sweep at 60px: a roll (~137px) clears its ~45px reach
    expect(dodgeDirection(e, foe)).toBe('back');
    expect(sidestep(e, ctx, foe)).toBe(true);
    expect(e.mover!.vx).toBeLessThan(0); // straight back from him (he is at +x)
    expect(Math.abs(e.mover!.vy)).toBeLessThan(1e-6);
    delete foe.melee;
    foe.loadout!.cd.clear();
    foe.attributes!.add({ stat: 'reach', op: 'flat', value: 500, source: 'test:longArms' }); // a sweep a roll from 60px can NOT clear
    expect(abilities.activate(foe, 'ability.kesa')).toBe(true);
    expect(dodgeDirection(e, foe)).toBe('side'); // can't get out: go around instead
    foe.attributes!.removeBySource('test:longArms');
    delete foe.melee;
    foe.loadout!.cd.clear();
    expect(abilities.activate(foe, 'ability.kamaitachi')).toBe(true); // a sweep whose WIND ARCS reach 120px: read off the volumes, not the blade
    foe.transform!.x = 20; // nearly on top of him: 20 + 137 > 120 + r — still clears, barely
    expect(dodgeDirection(e, foe)).toBe('back');
  });
});

describe('foeOpen — the whiff is an opening', () => {
  it('a foe recovering from a swing that hit nobody is open; one that landed, or still cutting, is not', () => {
    const { sp, abilities } = rig();
    const foe = sp.spawnUnit('unit.ronin', 0, 0);
    expect(foeOpen(foe)).toBe(false);
    foe.loadout!.granted.add('ability.kesa');
    expect(abilities.activate(foe, 'ability.kesa')).toBe(true);
    const m = foe.melee!;
    m.t = m.dur * (m.phases.windup + m.phases.active / 2); // cutting
    expect(foeOpen(foe)).toBe(false);
    m.t = m.dur * (m.phases.windup + m.phases.active + 0.01); // recovering, nothing hit
    expect(foeOpen(foe)).toBe(true);
    m.hitByVolume[0] = [42]; // it landed on someone
    expect(foeOpen(foe)).toBe(false);
    applyEffect(foe, 'effect.staggered', 'test', 1);
    expect(foeOpen(foe)).toBe(true); // staggered is open as ever
  });

  it('pickAttack ripostes the whiff with the heavy', () => {
    const { sp, abilities, ctx } = rig(3);
    const e = sp.spawnUnit('unit.ronin', 30, 0);
    const foe = sp.spawnUnit('unit.samurai', 0, 0);
    expect(abilities.activate(foe, 'ability.kesa')).toBe(true);
    foe.melee!.t = foe.melee!.dur * 0.95; // recovering, nothing landed
    let heavies = 0;
    for (let i = 0; i < 30; i++) if (pickAttack(e, ctx, 30, foe) === 'ability.shukuchiZuki') heavies++;
    expect(heavies).toBeGreaterThanOrEqual(22); // ~0.9 punish chance
  });
});

describe('specials for a reason', () => {
  it('the rows carry their reasons', () => {
    expect(Abilities.get('ability.rashomon').tags).toEqual(expect.arrayContaining([AI_ROLE_GAP_CLOSER, AI_ROLE_GUARD_BREAK]));
    expect(Abilities.get('ability.kokutoIai').tags).toEqual(expect.arrayContaining([AI_ROLE_GUARD_BREAK, AI_ROLE_FINISHER]));
    expect(Abilities.get('ability.nanajuniPound').tags).toContain(AI_ROLE_RANGED);
    expect(Abilities.get('ability.saiKuru').tags).toContain(AI_ROLE_GAP_CLOSER);
  });

  it('IN REACH: a raised or cracked guard draws the guard breaker; a foe nearly done draws the finisher; still gated by the technique\'s own needs', () => {
    const { sp, ctx } = rig();
    const e = sp.spawnUnit('unit.ronin', 40, 0);
    const foe = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    expect(situationalPick(e, ctx, 40, foe)).toBeUndefined(); // nothing to read
    foe.combatant!.blocking = true;
    expect(situationalPick(e, ctx, 40, foe)).toBeUndefined(); // Kokutō needs the coating: not ready
    applyEffect(e, 'effect.armament', 'test');
    expect(situationalPick(e, ctx, 40, foe)).toBe('ability.kokutoIai'); // coated: the black draw against the turtle
    foe.combatant!.blocking = false;
    foe.combatant!.posture = foe.combatant!.maxPosture * CRACKED_GUARD; // a cracked guard reads the same
    expect(situationalPick(e, ctx, 40, foe)).toBe('ability.kokutoIai');
    foe.combatant!.posture = 0;
    foe.health!.hp = foe.health!.maxHp * FINISHER_HP;
    expect(situationalPick(e, ctx, 40, foe)).toBe('ability.kokutoIai'); // the finisher's reason
    expect(situationalPick(e, ctx, 400, foe)).toBeUndefined(); // out of its reach
    // pickAttack takes the reasoned pick before any roll
    expect(pickAttack(e, ctx, 40, foe)).toBe('ability.kokutoIai');
    const t = sp.spawnUnit('unit.thug', 40, 100);
    expect(pickAttack(t, ctx, 40, foe)).toBe(t.loadout!.primary); // fodder reads nothing: its plain strike
  });

  it('OUT OF REACH: a gap closer that reaches the foe, else a ranged poke at a REGROUPING foe', () => {
    const { sp, ctx } = rig();
    const z = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    const foe = sp.spawnUnit('unit.ronin', 500, 0);
    expect(situationalCloser(z, ctx, 500, foe)).toBeUndefined(); // Rashōmon needs the coating; Sai Kuru reaches ~450
    applyEffect(z, 'effect.armament', 'test');
    expect(situationalCloser(z, ctx, 500, foe)).toBe('ability.rashomon'); // across the ring, coated
    expect(situationalCloser(z, ctx, 300, foe)).toBe('ability.rashomon'); // slots scan before the heavy (pickAttack's order): the slot closer first
    z.loadout!.cd.set('ability.rashomon', 5);
    expect(situationalCloser(z, ctx, 300, foe)).toBe('ability.saiKuru'); // spent: the heavy's charge reaches 300
    z.loadout!.cd.delete('ability.rashomon');
    const far = sp.spawnUnit('unit.ronin', 2000, 0);
    expect(situationalCloser(z, ctx, 2000, far)).toBeUndefined(); // nothing reaches
    const r = sp.spawnUnit('unit.ronin', 380, 0);
    r.ai!.bb.regrouping = true;
    z.loadout!.cd.set('ability.rashomon', 5); // the closers spent…
    z.loadout!.cd.set('ability.saiKuru', 5);
    expect(situationalCloser(z, ctx, 380, r)).toBe('ability.nanajuniPound'); // …the flying slashes make him pay for the space
  });

  it('the RANGED POKE at a foe who is merely far: at rangedChance per decision beat — a sure thing at 1, never at 0, one roll per beat', () => {
    const { sp, ctx } = rig(9);
    const z = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    const foe = sp.spawnUnit('unit.ronin', 380, 0); // out of reach, not regrouping; the closers can't reach from here uncoated
    z.loadout!.cd.set('ability.saiKuru', 5);
    z.ai!.bb.profile = { ...z.ai!.bb.profile, rangedChance: 1 };
    expect(situationalCloser(z, ctx, 380, foe)).toBe('ability.nanajuniPound');
    expect(z.ai!.bb.decideCd).toBeGreaterThan(0); // the decision slot is consumed…
    expect(situationalCloser(z, ctx, 380, foe)).toBeUndefined(); // …so the next tick does not re-roll
    z.ai!.bb.decideCd = 0;
    z.ai!.bb.profile = { ...z.ai!.bb.profile, rangedChance: 0 };
    expect(situationalCloser(z, ctx, 380, foe)).toBeUndefined(); // 0: only a regrouper gets shot at
    expect(zoro.rangedChance).toBe(0.4);
    expect(zoro.dodgeByWeight).toEqual({ medium: 0.2, heavy: 0.3 }); // and he can now dodge the Ronin's MEDIUM cuts — the backstep cases
  });

  it('a special\'s chain is continued: Sai Kuru armed → the next press is the heavy again (→ Taka Nami), not a fresh roll', () => {
    const { sp, ctx } = rig();
    const z = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    const foe = sp.spawnUnit('unit.ronin', 40, 0);
    z.loadout!.chain = { root: 'ability.saiKuru', next: 'ability.takaNami', until: 1 };
    for (let i = 0; i < 10; i++) expect(pickAttack(z, ctx, 40, foe)).toBe('ability.saiKuru');
    z.loadout!.cd.set('ability.saiKuru', 5); // unless it can't be pressed
    expect(pickAttack(z, ctx, 40, foe)).not.toBe('ability.saiKuru');
  });
});

describe('combo intent\'s memory — noteSwing, under the real tick order (the AI sees a new swing at t = dt, never at 0)', () => {
  it('a swing that lands sets the flag; the gap resets the clock; the next swing starts clean and stays false when it whiffs', () => {
    const bb = { lastSwingLanded: undefined as boolean | undefined, lastSwingT: undefined as number | undefined } as unknown as Parameters<typeof noteSwing>[0];
    const swing = (t: number, hit: boolean) => ({ ability: 'ability.toro', t, dur: 0.5, motion: 'arc', phases: { windup: 0.3, active: 0.4, recover: 0.3 }, side: 1, angle: 0, hitByVolume: hit ? [[7]] : [] }) as unknown as Parameters<typeof noteSwing>[1];
    noteSwing(bb, swing(1 / 60, false)); // swing 1, first tick (already advanced once by the melee tick last frame)
    expect(bb.lastSwingLanded).toBe(false);
    noteSwing(bb, swing(0.2, true)); // it lands
    expect(bb.lastSwingLanded).toBe(true);
    noteSwing(bb, swing(0.5, true));
    noteSwing(bb, undefined); // the swing ended — the flag is KEPT for the chain-window decision…
    expect(bb.lastSwingLanded).toBe(true);
    noteSwing(bb, swing(1 / 60, false)); // …swing 2 begins: a clean slate
    expect(bb.lastSwingLanded).toBe(false);
    noteSwing(bb, swing(0.3, false));
    noteSwing(bb, swing(0.5, false));
    noteSwing(bb, undefined);
    expect(bb.lastSwingLanded).toBe(false); // it whiffed end to end — the finisher will be held
    noteSwing(bb, swing(0.1, false)); // swing 3 interrupts nothing; a clock that went BACK without a gap is a restart too
    noteSwing(bb, swing(0.4, true));
    noteSwing(bb, swing(0.05, false)); // a chained step starts mid-stream (t went back)
    expect(bb.lastSwingLanded).toBe(false);
  });
});

describe('combo intent', () => {
  it('holds the press on the FINISHER after a whiff; presses after a landed step; never holds a non-finisher or without a chain', () => {
    const { sp } = rig();
    const z = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    const lo = z.loadout!;
    expect(holdFinisher(zoro, lo, false)).toBe(false); // no chain armed
    lo.chain = { root: 'ability.toro', next: 'ability.hirameki', until: 1 }; // the next step is NOT the finisher
    expect(holdFinisher(zoro, lo, false)).toBe(false);
    lo.chain = { root: 'ability.toro', next: 'ability.samon', until: 1 }; // the finisher
    expect(holdFinisher(zoro, lo, false)).toBe(true); // whiffed: hold
    expect(holdFinisher(zoro, lo, true)).toBe(false); // landed: finish
    expect(holdFinisher(zoro, lo, undefined)).toBe(false); // unknown: press (the first swing of a fight)
    expect(holdFinisher(thug, lo, false)).toBe(false); // fodder walks every chain
  });
});
void (null as unknown as Entity);
