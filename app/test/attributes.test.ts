import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_IDS,
  DEF_PER_DEFENSE,
  HP_PER_HEALTH,
  POSTURE_PER_WILLPOWER,
  STAM_PER_ENDURANCE,
  deriveAttributeStats,
  tierAttributes,
} from '../src/combat/attributes';
import { tierIndex, tierStats } from '../src/combat/PowerTier';
import { StatBlock } from '../src/combat/StatBlock';
import { MAX_STAM } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Units } from '../src/defs/units';

describe('attributes — tier seeding', () => {
  it('restates the tier curve in attribute language (health/defense), endurance flat, reserved at 0', () => {
    for (const t of ['F-', 'E-', 'A'] as const) {
      const a = tierAttributes(t);
      const ts = tierStats(t);
      expect(a.health).toBe(ts.hp);
      expect(a.defense).toBe(ts.def);
      expect(a.endurance).toBe(MAX_STAM); // fitness, not rank — flat across tiers
      expect(a.willpower).toBe(20 + 2 * tierIndex(t)); // seeds the posture pool (combat/guard) — gentle rank climb
      expect(a.luck).toBe(0); // no consumer yet (crit/drops)
      expect(a.spiritual).toBe(0); // no consumer yet (haki pool)
    }
    // every canonical attribute is present on every seed — no partial spreads out of the tier path
    expect(Object.keys(tierAttributes('F')).sort()).toEqual([...ATTRIBUTE_IDS].sort());
  });
});

describe('attributes — derivation', () => {
  it('derives maxHp/maxStam/def from health/endurance/defense', () => {
    const sb = new StatBlock({ health: 50, endurance: 80, defense: 4 });
    deriveAttributeStats(sb);
    expect(sb.get('maxHp')).toBe(50 * HP_PER_HEALTH);
    expect(sb.get('maxStam')).toBe(80 * STAM_PER_ENDURANCE);
    expect(sb.get('def')).toBe(4 * DEF_PER_DEFENSE);
  });

  it('re-derive is idempotent and picks up allocation (setBase) — the stat-point path', () => {
    const sb = new StatBlock({ health: 50, endurance: 80, defense: 0 });
    deriveAttributeStats(sb);
    deriveAttributeStats(sb); // must wipe-and-replace, not stack
    expect(sb.get('maxHp')).toBe(50 * HP_PER_HEALTH);
    sb.setBase('health', 60); // "spend a stat point in Health"
    deriveAttributeStats(sb);
    expect(sb.get('maxHp')).toBe(60 * HP_PER_HEALTH);
  });

  it('attribute-layer modifiers (race/buff on health) flow into maxHp on re-derive', () => {
    const sb = new StatBlock({ health: 50, endurance: 80, defense: 0 });
    deriveAttributeStats(sb);
    sb.add({ stat: 'health', op: 'addPct', value: 0.1, source: 'race:fishman' });
    deriveAttributeStats(sb); // the documented contract: re-derive after attribute-layer changes
    expect(sb.get('maxHp')).toBeCloseTo(55 * HP_PER_HEALTH, 10); // 50 × 1.1 carries float noise
  });

  it('derived stats still compose with direct gear modifiers on the derived stat', () => {
    const sb = new StatBlock({ health: 50, endurance: 80, defense: 2 });
    deriveAttributeStats(sb);
    sb.add({ stat: 'def', op: 'flat', value: 3, source: 'weapon:buckler' });
    expect(sb.get('def')).toBe(2 * DEF_PER_DEFENSE + 3);
  });
});

describe('attributes — spawn integration', () => {
  it('a unit seeds its stats from its TIER (statTier defaults to tier — the raised floor)', () => {
    const w = new World();
    const sp = new Spawner(w, new Rng(1));
    const boss = sp.spawnUnit('unit.brawler', 0, 0); // D- boss, no statTier ⇒ seeds from D-, hpMult 2.4
    const d = tierStats('D-'); // its rank tier IS its stat tier now
    expect(boss.health!.maxHp).toBe(Math.round(d.hp * 2.4)); // hpBloat rides the modifier pipeline
    expect(boss.attributes!.get('def')).toBe(d.def);
    expect(boss.combatant!.maxStam).toBe(MAX_STAM); // endurance seed → derived maxStam → combatant pool
    expect(boss.combatant!.maxPosture).toBe(Math.round((20 + 2 * tierIndex('D-')) * POSTURE_PER_WILLPOWER)); // willpower seed × conversion → maxPosture
    expect(boss.attributes!.get('atk')).toBe(d.atk); // non-attribute magnitudes untouched
  });

  it("a def's per-unit attribute spread replaces its tier seed (and only its own)", () => {
    Units.register({
      id: 'unit.testGlassCannon',
      name: 'Glass Cannon',
      body: 'body.humanoid',
      tier: 'E-',
      faction: 'bandits',
      aiProfile: 'ai.rusher',
      attackAbility: 'ability.punch',
      attributes: { health: 12 },
    });
    const w = new World();
    const sp = new Spawner(w, new Rng(1));
    const e = sp.spawnUnit('unit.testGlassCannon', 0, 0);
    expect(e.health!.maxHp).toBe(Math.round(12 * HP_PER_HEALTH)); // override, not the E- curve
    expect(e.combatant!.maxStam).toBe(MAX_STAM); // untouched attributes keep their tier seed
    expect(e.attributes!.get('def')).toBe(tierStats('E-').def);
  });

  it('rejects a def with a negative attribute at boot (fail loud, not mid-game)', () => {
    Units.register({
      id: 'unit.testBadSpread',
      name: 'Bad Spread',
      body: 'body.humanoid',
      tier: 'F',
      faction: 'bandits',
      aiProfile: 'ai.rusher',
      attackAbility: 'ability.punch',
      attributes: { luck: -1 },
    });
    expect(() => Units.get('unit.testBadSpread')).toThrow(/luck/);
  });
});
