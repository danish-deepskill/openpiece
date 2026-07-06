import { describe, expect, it } from 'vitest';
import { pickAttack, planRegroupSpecial } from '../src/ai/brains';
import type { AIContext } from '../src/ai/Brain';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';

/**
 * The AI ability rotation (brains.pickAttack): a profile with specialChance > 0 WEAVES its loadout's
 * specials (fruit heavy/slots) into the jab; specialChance 0 always throws the primary. Generic — the
 * candidates come from the unit's OWN loadout, so this is the same engine for soldier/brawler/Luffy.
 */

/** A stub context: only `rng` + `abilities.ready` are read by pickAttack. `rollFirst` forces the
 *  specialChance gate (rng.next() < chance) either open (0) or shut (0.99). `ready` marks which ability
 *  ids are off-cooldown; anything not listed reads as on-cooldown (skipped). */
function stubCtx(rollFirst: number, ready: Set<string>): AIContext {
  let firstRoll = true;
  const rng = {
    next() {
      if (firstRoll) { firstRoll = false; return rollFirst; }
      return 0;
    },
  } as unknown as Rng;
  return {
    rng,
    abilities: { ready: (_e: Entity, id: string) => ready.has(id) } as unknown as AIContext['abilities'],
  } as unknown as AIContext;
}

function luffy(): Entity {
  return new Spawner(new World(), new Rng(1)).spawnUnit('unit.luffy', 0, 0);
}

const ALL_READY = new Set(['ability.gomuGatling', 'ability.gomuRocket', 'ability.gomuStamp', 'ability.gomuPistol']);

describe('AI ability rotation (pickAttack)', () => {
  it('Luffy is granted the full Gomu kit (primary + heavy + slots) — the rotation has candidates', () => {
    const e = luffy();
    const lo = e.loadout!;
    expect(lo.primary).toBe('ability.gomuPistol'); // fruit takes over the light primary
    expect(lo.heavy).toBe('ability.gomuStamp'); // …and the heavy
    expect(lo.slots).toEqual(['ability.gomuGatling', 'ability.gomuRocket', 'ability.gomuOno']); // the number-key specials (1/2/3)
  });

  it('the specialChance roll SHUT → always the primary (the fast jab), never a special', () => {
    const e = luffy();
    // rng.next() = 0.99 ≥ specialChance (0.35) → the gate refuses; even with everything ready + point-blank
    expect(pickAttack(e, stubCtx(0.99, ALL_READY), 0)).toBe('ability.gomuPistol');
  });

  it('roll OPEN + a special ready + in ITS range → throws the special (slots before heavy)', () => {
    const e = luffy();
    e.combatant!.stam = 100; // afford anything
    // rng.next() = 0 < 0.35 → gate opens. At point-blank (dist 0) every special is in range; Gatling is the
    // first slot, so it wins the priority order (slots first, heavy last).
    expect(pickAttack(e, stubCtx(0, ALL_READY), 0)).toBe('ability.gomuGatling');
  });

  it('a special OUT of its own range is skipped — falls to the next candidate, then the primary', () => {
    const e = luffy();
    e.combatant!.stam = 100;
    // dist 130: Gatling (range 85) + Rocket (95) are OUT of their reach; Stamp (140) still reaches → Stamp.
    expect(pickAttack(e, stubCtx(0, ALL_READY), 130)).toBe('ability.gomuStamp');
    // dist 200: nothing special reaches → the reliable primary jab.
    expect(pickAttack(e, stubCtx(0, ALL_READY), 200)).toBe('ability.gomuPistol');
  });

  it('an UNAFFORDABLE special is skipped (stamina gate) even when ready + in range', () => {
    const e = luffy();
    e.combatant!.stam = 20; // Gatling costs 26, Rocket 18, Stamp 16 → only Rocket/Stamp affordable
    // Gatling skipped (26 > 20) → Rocket is next slot and affordable + in range at point-blank.
    expect(pickAttack(e, stubCtx(0, ALL_READY), 0)).toBe('ability.gomuRocket');
  });

  it('an on-COOLDOWN special is skipped (only Stamp ready) → Stamp', () => {
    const e = luffy();
    e.combatant!.stam = 100;
    expect(pickAttack(e, stubCtx(0, new Set(['ability.gomuStamp'])), 0)).toBe('ability.gomuStamp');
  });

  it('a REGROUPING Luffy conserves — forces the cheap primary even with every special ready + affordable', () => {
    const e = luffy();
    e.combatant!.stam = 100; // rich…
    e.ai!.bb.regrouping = true; // …but resetting: the harry jab must stay cheap (never a Gatling mid-reset)
    // roll wide open (0 < specialChance) + everything ready + point-blank — yet the regroup guard wins.
    expect(pickAttack(e, stubCtx(0, ALL_READY), 0)).toBe('ability.gomuPistol');
  });

  it('a fodder profile (specialChance unset → 0) always throws its primary — no regression', () => {
    const thug = new Spawner(new World(), new Rng(1)).spawnUnit('unit.thug', 0, 0); // ai.rusher, no specialChance
    // even a wide-open roll (0) can never reach a special: the chance gate is 0, so it returns the primary first.
    expect(pickAttack(thug, stubCtx(0, ALL_READY), 0)).toBe(thug.loadout!.primary);
  });
});

describe('Rocket-reposition mini-intent (planRegroupSpecial): commit → conserve → fire', () => {
  const NONE = new Set<string>(); // nothing affordable/ready (simulates the low-stamina regrouper)

  it('no plan + roll SUCCEEDS + heavy not yet affordable → COMMITS the plan and CONSERVES (does not jab)', () => {
    const e = luffy();
    e.ai!.bb.regrouping = true;
    // roll 0 < rocketEscapeChance (0.35) → commit; heavy (Rocket) NOT in the ready set → can't fire yet → conserve.
    expect(planRegroupSpecial(e, stubCtx(0, NONE))).toBe('conserve');
    expect(e.ai!.bb.plannedSpecial).toBe('ability.gomuRocket'); // the plan is now banked (persisted)
  });

  it('no plan + roll SUCCEEDS + heavy already affordable → COMMITS and FIRES immediately', () => {
    const e = luffy();
    e.ai!.bb.regrouping = true;
    expect(planRegroupSpecial(e, stubCtx(0, new Set(['ability.gomuRocket'])))).toBe('fire');
    expect(e.ai!.bb.plannedSpecial).toBe('ability.gomuRocket');
  });

  it('no plan + roll FAILS → no plan, just jab this beat (no commitment)', () => {
    const e = luffy();
    e.ai!.bb.regrouping = true;
    // roll 0.99 ≥ 0.35 → rolled against it → jab, no plan banked.
    expect(planRegroupSpecial(e, stubCtx(0.99, NONE))).toBe('jab');
    expect(e.ai!.bb.plannedSpecial).toBeUndefined();
  });

  it('an EXISTING plan persists: unaffordable → keeps conserving; the roll is NOT re-rolled', () => {
    const e = luffy();
    e.ai!.bb.regrouping = true;
    e.ai!.bb.plannedSpecial = 'ability.gomuRocket'; // already committed a prior beat
    // even with a roll that WOULD fail a fresh commit (0.99), the existing plan holds — it conserves, no re-roll.
    expect(planRegroupSpecial(e, stubCtx(0.99, NONE))).toBe('conserve');
    expect(e.ai!.bb.plannedSpecial).toBe('ability.gomuRocket'); // still banked
  });

  it('an EXISTING plan fires the moment the heavy becomes affordable (regen carried it there)', () => {
    const e = luffy();
    e.ai!.bb.regrouping = true;
    e.ai!.bb.plannedSpecial = 'ability.gomuRocket';
    expect(planRegroupSpecial(e, stubCtx(0.99, new Set(['ability.gomuRocket'])))).toBe('fire');
  });

  it('a profile without rocketEscapeChance never plans — always jab while pinned (no regression)', () => {
    const thug = new Spawner(new World(), new Rng(1)).spawnUnit('unit.thug', 0, 0);
    thug.ai!.bb.regrouping = true;
    expect(planRegroupSpecial(thug, stubCtx(0, ALL_READY))).toBe('jab');
    expect(thug.ai!.bb.plannedSpecial).toBeUndefined();
  });

  it('CADENCE: a decision arms decideCd so the roll is per-DECISION, not per-tick (the "always Rocket" fix)', () => {
    // the bug you saw: rolling every tick snowballs 35% into ~always. After ANY roll, decideCd is armed → the
    // next call within the cadence must NOT roll again (it jabs), even with a roll value that WOULD commit.
    const e = luffy();
    e.ai!.bb.regrouping = true;
    expect(e.ai!.bb.decideCd ?? 0).toBe(0); // clock open on the first decision
    expect(planRegroupSpecial(e, stubCtx(0.99, NONE))).toBe('jab'); // rolled against → jab
    expect(e.ai!.bb.decideCd).toBeGreaterThan(0); // …and the clock is now ARMED
    // immediately again, with a roll that WOULD have committed (0) — but the clock is shut, so no re-roll: jab.
    expect(planRegroupSpecial(e, stubCtx(0, NONE))).toBe('jab');
    expect(e.ai!.bb.plannedSpecial).toBeUndefined(); // proof it did NOT snowball into a commit
  });
});
