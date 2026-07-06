import { describe, expect, it } from 'vitest';
import { AIProfiles, combatStance } from '../src/defs/aiProfiles';

const rusher = AIProfiles.get('ai.rusher');
const kiter = AIProfiles.get('ai.kiter');
const guard = AIProfiles.get('ai.guard');
const coward = AIProfiles.get('ai.coward');
const master = AIProfiles.get('ai.master'); // has regroupBelowStam 0.3 / reengageStam 0.75

describe('combatStance (AI decision)', () => {
  it('rusher: approach when out of reach, attack when in reach', () => {
    const out = combatStance(rusher, 100, 40, 1, 0);
    expect(out.move).toBe('approach');
    expect(out.attack).toBe(false);
    const inR = combatStance(rusher, 30, 40, 1, 0);
    expect(inR.move).toBe('hold');
    expect(inR.attack).toBe(true);
  });

  it('kiter: backs off when closer than its preferred range', () => {
    expect(combatStance(kiter, 50, 40, 1, 0).move).toBe('away'); // < preferredRange 170
    expect(combatStance(kiter, 250, 40, 1, 0).move).toBe('approach'); // beyond preferred range
  });

  it('guard: returns home when the target leaves its post, engages within it', () => {
    expect(combatStance(guard, 30, 40, 1, 999).move).toBe('home'); // target far from post
    const inPost = combatStance(guard, 30, 40, 1, 50);
    expect(inPost.move).toBe('hold');
    expect(inPost.attack).toBe(true);
  });

  it('coward: always flees', () => {
    expect(combatStance(coward, 300, 40, 1, 0).move).toBe('away');
    expect(combatStance(coward, 30, 40, 1, 0).move).toBe('away');
  });
});

describe('combatStance — tactical stamina retreat (hysteresis)', () => {
  const home = 50; // inside the master's guardRadius so the post-check doesn't preempt

  it('full stamina: fights normally (no regroup)', () => {
    const s = combatStance(master, 30, 40, 1, home, 1.0, false);
    expect(s.attack).toBe(true);
    expect(s.regroup).toBe(false);
  });

  it('drops below regroupBelowStam → breaks off, backs to spacing, stops attacking', () => {
    const s = combatStance(master, 30, 40, 1, home, 0.25, false); // 0.25 ≤ 0.3
    expect(s.regroup).toBe(true);
    expect(s.attack).toBe(false);
    expect(s.move).toBe('away'); // too close → retreat to regen
  });

  it('HYSTERESIS: still regrouping in the mid-band (does not re-engage until reengageStam)', () => {
    // 0.5 is above regroupBelowStam(0.3) but below reengageStam(0.75): a memoryless check would re-engage;
    // the band keeps it out until fully recovered.
    const s = combatStance(master, 30, 40, 1, home, 0.5, true);
    expect(s.regroup).toBe(true);
    expect(s.attack).toBe(false);
  });

  it('recovers to reengageStam → re-engages fresh, attacks again', () => {
    const s = combatStance(master, 30, 40, 1, home, 0.8, true); // 0.8 ≥ 0.75
    expect(s.regroup).toBe(false);
    expect(s.attack).toBe(true);
  });

  it('while regrouping at range, HOLDS spacing (does not creep back in early)', () => {
    const s = combatStance(master, 250, 40, 1, home, 0.25, true); // already far, low stam
    expect(s.move).toBe('hold');
    expect(s.attack).toBe(false);
  });

  it('a profile without the knobs never regroups (fodder fights to exhaustion)', () => {
    expect(combatStance(rusher, 30, 40, 1, 0, 0.01, false).attack).toBe(true); // empty bar, still swinging
    expect(combatStance(rusher, 30, 40, 1, 0, 0.01, false).regroup).toBe(false);
  });
});

describe('ai.luffy — stamina reset + backward-roll disengage (the rubber-brawler pacing)', () => {
  const luffy = AIProfiles.get('ai.luffy');

  it('carries the retreat band + the juke/harry flags (the data contract the brain reads)', () => {
    // these are what let Luffy reset stamina by CIRCLING (not fleeing) while still jabbing — the anti-coward kit.
    // low entry (0.1) = fights nearly to empty (relentless); fuller exit (0.6) = bigger, more separated bursts.
    expect(luffy.regroupBelowStam).toBe(0.1);
    expect(luffy.reengageStam).toBe(0.6);
    expect(luffy.retreatRoll).toBe(true);
    expect(luffy.rollSidewaysChance).toBe(0.75); // mostly juke sideways vs flee straight back
    expect(luffy.harryWhileRegroup).toBe(true);
  });

  it('carries leadAim — predictive targeting (the anti-circle-kite fix)', () => {
    expect(luffy.leadAim).toBe(0.28); // aims ~one Pistol-windup ahead of your velocity
  });

  it('lead-aim geometry: a circling target gets aimed AHEAD along its velocity, not at where it IS', () => {
    // the brain's lead offset is (perceived + vel × leadAim). A player orbiting rightward (moving +y) at the
    // shooter's east is aimed at a point PULLED FORWARD along +y — so the narrow Pistol cone leads the orbit
    // instead of committing to the stale spot behind the moving target (which circling exploited).
    const lead = luffy.leadAim ?? 0;
    const perceived = { x: 100, y: 0 }; // where the target appears (east of the shooter at origin)
    const vel = { vx: 0, vy: 120 }; // orbiting upward (perpendicular to the aim line)
    const aimX = perceived.x + vel.vx * lead;
    const aimY = perceived.y + vel.vy * lead;
    expect(aimX).toBe(100); // no forward/back change (velocity is perpendicular)
    expect(aimY).toBeCloseTo(120 * 0.28, 5); // ≈ 33.6px LED upward — the aim tracks where the orbit is going
    expect(aimY).toBeGreaterThan(perceived.y); // strictly ahead of the current position
  });

  it('fights on until nearly EMPTY — 20% stamina is still above the 10% entry (not yet regrouping)', () => {
    // the relentless read: at a fifth of his bar he's STILL swinging, not backing off — entry only trips at ≤10%.
    const s = combatStance(luffy, 30, 60, 1, 0, 0.2, false); // 0.2 > 0.1 → keeps fighting
    expect(s.regroup).toBe(false);
    expect(s.attack).toBe(true); // in reach → swings
  });

  it('regrouping + target CROWDS into reach → still jabs (harry), does not go passive', () => {
    // harryWhileRegroup: when the player chases him into reach mid-reset, he throws the cheap primary rather
    // than turtling — this is what kills the "he just runs and never fights back" feel.
    const s = combatStance(luffy, 30, 60, 1, 0, 0.05, false); // spent (0.05 ≤ 0.1) but target is INSIDE reach (30 ≤ 60)
    expect(s.regroup).toBe(true);
    expect(s.attack).toBe(true); // harrying jab (the brain forces the cheap primary in this state)
  });

  it('regrouping + target OUT of reach → holds fire (banks the bar; the reset still works)', () => {
    const s = combatStance(luffy, 120, 60, 1, 0, 0.05, false); // spent, target beyond reach (120 > 60)
    expect(s.regroup).toBe(true);
    expect(s.attack).toBe(false); // nothing to jab — conserve
  });

  it('CORNERED while regrouping (pinned in reach) → turns and FIGHTS, does not flee into the wall', () => {
    // the edge case: player pins him against a wall mid-reset so he can't make space. A pinned harrier must
    // HOLD + swing (move !== 'away' → the brain's strike block runs), never keep rolling backward uselessly.
    const s = combatStance(luffy, 25, 60, 1, 0, 0.05, true); // point-blank (25 ≤ 60), spent, already regrouping
    expect(s.regroup).toBe(true);
    expect(s.move).toBe('hold'); // NOT 'away' — fleeing is futile when cornered, so he commits
    expect(s.attack).toBe(true); // fights back (the cheap jab) instead of being a punching bag
  });

  it('a NON-harrier cornered while regrouping stays pure-conserve (the flag is load-bearing)', () => {
    // ai.master regroups but has no harryWhileRegroup → even pinned it keeps trying to reset (would rather bank
    // the bar than spend it). Proves the corner-fight is gated by the flag, not universal.
    const s = combatStance(master, 25, 60, 1, 50, 0.2, true); // pinned, low stam, already regrouping, inside its post
    expect(s.regroup).toBe(true);
    expect(s.attack).toBe(false); // no harry flag → does not commit to a fight while resetting
  });

  it('reserves enough to re-engage with a Gatling: reengageStam(0.6)×100 = 60 stam ≥ Gatling cost (26)', () => {
    // even fighting to near-empty, the reset comes back able to afford his most expensive special, not just a jab.
    const reengageStam = (luffy.reengageStam ?? 0) * 100; // maxStam is 100 (flat endurance)
    expect(reengageStam).toBeGreaterThanOrEqual(26); // Gomu Gatling costStam
  });
});
