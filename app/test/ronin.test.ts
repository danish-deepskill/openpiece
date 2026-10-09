import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { effectiveTier } from '../src/combat/dominance';
import { applyEffect, TAG_ARMAMENT } from '../src/combat/Effect';
import { letters, tierIndex } from '../src/combat/PowerTier';
import { DEFLECT_STAT } from '../src/combat/stats';
import { abilityReach } from '../src/combat/swing';
import { ARENA } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { Accessories } from '../src/defs/accessories';
import { AIProfiles } from '../src/defs/aiProfiles';
import { accessoryDraws } from '../src/draw/accessoryDraws';
import { factions } from '../src/defs/factions';
import { Units, unitProblem } from '../src/defs/units';
import { Weapons } from '../src/defs/layers';
import { fxThemeOf } from '../src/combat/fxTheme';
import { coatedKey } from '../src/draw/coating';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';
import { generateLevel } from '../src/world/WorldGen';

const spawnRonin = () => {
  const world = new World();
  const sp = new Spawner(world, new Rng(5));
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)); // no strikes needed here
  return { world, sp, abilities, e: sp.spawnUnit('unit.ronin', 0, 0) };
};

describe('unit.ronin — the A- master: quality, not numbers', () => {
  it('spawns at B as a ronin (at war with nobody), wearing the elite katana, kenjutsu AND the Armament haki', () => {
    const { e } = spawnRonin();
    expect(e.identity!.tier).toBe('A-'); // haki is A-+ by rule (HAKI_MIN_TIER)
    expect(e.faction!.id).toBe('ronin');
    for (const f of ['straw_hat', 'marine', 'pirates', 'bandits', 'civilians', 'wildlife'] as const) expect(factions.isHostile('ronin', f)).toBe(false); // he fights only who draws on him…
    expect(factions.isHostile('ronin', 'challengers')).toBe(true); // …and the challengers who come to his arena (test/zoro)
    for (const f of ['straw_hat', 'marine', 'pirates', 'civilians'] as const) expect(factions.isHostile(f, 'ronin')).toBe(false); // (bandits hate everyone by their own default)
    const lo = e.loadout!;
    expect(e.equipment!.weapon).toBe('weapon.katanaElite');
    expect(lo.primary).toBe('ability.shukuchiGiri'); // his OWN chain, not the Samurai's
    expect(lo.heavy).toBe('ability.shukuchiZuki');
    expect(lo.dash).toBe('ability.sandan'); // battōjutsu: the three-step is his Q
    expect(lo.utilities).toEqual(['ability.armament', 'ability.kiaiElite']); // C the coating, X the master's shout — nothing shadowed
    expect(lo.granted.has('ability.kiaiElite')).toBe(true);
    expect(lo.slots).toEqual(['ability.kamaitachi', 'ability.kokutoIai']);
    for (const id of ['ability.kaeshi', 'ability.shippu', 'ability.senpu']) expect(lo.granted.has(id)).toBe(true); // the chains' later steps come with their roots
    expect(e.ai!.bb.boss).toBe(true);
  });

  it('wears a kabuto and a crimson sode — his own look, the sode by palette not by a second draw', () => {
    const { e } = spawnRonin();
    expect(e.accessories!.slots.head).toBe('accessory.kabuto');
    expect(e.accessories!.slots.chest).toBe('accessory.sodeRonin');
    for (const id of ['accessory.kabuto', 'accessory.sodeRonin']) {
      const d = Accessories.get(id);
      expect(d.palette?.trim).toBe(0xd4af37); // gold fittings on both
      if (d.visual.kind === 'procedural') expect(accessoryDraws[d.visual.draw]).toBeDefined(); // the draw key resolves (the boot sweep's headless twin)
    }
    expect(Accessories.get('accessory.sodeRonin').visual).toEqual(Accessories.get('accessory.sode').visual); // same draw, different colors
  });

  it('haki is A-+ by rule: a def that hands a lower rank a haki layer fails at boot', () => {
    expect(unitProblem({ ...Units.get('unit.ronin'), id: 'unit.testLowHaki', tier: 'B' })).toMatch(/haki is A-\+ only/);
    expect(unitProblem({ ...Units.get('unit.ronin'), id: 'unit.testLowHaki', tier: 'A-' })).toBeNull();
  });

  it('the elite katana art exists and bakes a coated twin under a derived key', () => {
    const v = Weapons.get('weapon.katanaElite').visual!;
    expect(v.kind).toBe('sprite');
    if (v.kind === 'sprite') expect(existsSync(join(__dirname, '../src/art', v.art))).toBe(true);
    expect(coatedKey('weapon.katanaElite', 'haki')).toBe('weapon.katanaElite:haki');
  });

  it('his passives are traits: Flow (full stride mid-swing) and Iron Will (+50% posture on the combatant)', () => {
    const { e } = spawnRonin();
    expect(e.attributes!.get('attackMoveMult')).toBe(1);
    expect(e.combatant!.maxPosture).toBe(Math.round(e.attributes!.get('maxPosture'))); // synced from the stat…
    const plain = new Spawner(new World(), new Rng(5)).spawnUnit('unit.samurai', 0, 0);
    expect(plain.attributes!.get('attackMoveMult')).toBe(0.5);
    expect(e.attributes!.get('maxPosture')).toBeCloseTo(e.attributes!.get('willpower') * (e.attributes!.get('maxPosture') / e.attributes!.get('willpower')), 6); // …which carries the +50% (a derived stat with a mulPct on top)
  });

  it('his brain: holds the ring, reads weight, ripostes — knobs fodder leaves at zero; perception is the Samurai\'s', () => {
    const p = AIProfiles.get('ai.ronin');
    const s = AIProfiles.get('ai.samurai');
    expect(p.approach).toBe('guard');
    expect([p.sight, p.cone, p.reaction, p.spotDelay]).toEqual([s.sight, s.cone, s.reaction, s.spotDelay]); // no awareness buff
    expect(p.parryByWeight).toEqual({ medium: 0.55, heavy: 0.45 }); // the parry shares made room for the dodge (one roll: parry + block + dodge ≤ 1)
    expect(p.dodgeByWeight).toEqual({ medium: 0.25, heavy: 0.35 }); // the reader steps off committed blows…
    expect([p.guardReads, p.comboIntent, p.readsSituations]).toEqual([true, true, true]); // …and reads the guard, the chain, the situation
    expect(p.punishChance).toBe(0.9);
    expect(AIProfiles.get('ai.rusher').punishChance ?? 0).toBe(0);
  });

  it('his chains open from where the step lands him: dash-cut reach = blade + travel', () => {
    const { e } = spawnRonin();
    const giri = Abilities.get('ability.shukuchiGiri');
    const kaeshi = Abilities.get('ability.kaeshi');
    expect(abilityReach(e, giri) - abilityReach(e, kaeshi)).toBe(Math.round(500 * 0.14)); // 70px of step on top of the same blade
    expect(abilityReach(e, Abilities.get('ability.shukuchiZuki'))).toBeGreaterThan(abilityReach(e, giri) + 100); // the lunge: ~180px of travel
  });
});

describe('ARMAMENT on him — one effect, four generic seams, and the technique it unlocks', () => {
  it('pressing C coats him: the tag, +1 letter on the ladder, half the balls deflected, the black blade key', () => {
    const { abilities, e } = spawnRonin();
    expect(abilities.activate(e, 'ability.armament')).toBe(true);
    expect(e.tags!.has(TAG_ARMAMENT)).toBe(true);
    expect(effectiveTier(e)).toBe(tierIndex('A-') + letters(1));
    expect(e.attributes!.get(DEFLECT_STAT)).toBe(0.5); // a coin flip, not a wall — the hardening already halves what lands
    expect(fxThemeOf(e)).toBe('haki'); // the state every attack visual reads: blade, crescents, the gale, sparks
    expect(coatedKey(e.equipment!.weapon!, fxThemeOf(e)!)).toMatch(/:haki$/); // what WeaponSpriteSystem swaps to while the tag is on
  });

  it('Kokutō is a haki TECHNIQUE: locked until the coating is up, then ready; it carries a one-letter parry shift', () => {
    const { abilities, e } = spawnRonin();
    expect(abilities.ready(e, 'ability.kokutoIai')).toBe(false); // requireTags
    applyEffect(e, 'effect.armament', 'test');
    expect(abilities.ready(e, 'ability.kokutoIai')).toBe(true);
    const kokuto = Abilities.get('ability.kokutoIai');
    expect(kokuto.parryShift).toBe(letters(1));
    expect(kokuto.shape!.hitVolumes!.some((v) => v.kind === 'arc' && v.radius >= 100)).toBe(true); // the black wave past the blade
    expect(kokuto.launchAt).toEqual([kokuto.shape!.phases!.windup]); // he steps in as the blade leaves the sheath
  });
});

describe('the desert arena holds him — and three dummies to practice on', () => {
  it('nothing is placed in the ring at world-gen: the duel gong summons him, the training post the dummies (test/duel-gong)', () => {
    const level = generateLevel(new Rng(0));
    expect(level.enemies.some((e) => e.unit === 'unit.ronin' || e.unit === 'unit.dummy')).toBe(false);
    expect(level.structures.some((s) => s.def === 'structure.duelGong')).toBe(true);
    expect(level.structures.some((s) => s.def === 'structure.trainingPost')).toBe(true);
    const inRing = (tx: number, ty: number) => Math.max(Math.abs(tx - ARENA.cx), Math.abs(ty - ARENA.cy)) < 4.8;
    for (const s of level.structures.filter((x) => x.def === 'structure.duelGong' || x.def === 'structure.trainingPost')) expect(inRing(s.tx, s.ty)).toBe(true);
  });

  it('a dummy is a body that never answers: wildlife (anyone may strike it, it hunts nobody), no guard, sees nothing, lasts', () => {
    const d = new Spawner(new World(), new Rng(1)).spawnUnit('unit.dummy', 0, 0);
    expect(d.faction!.id).toBe('wildlife');
    expect(factions.canHarm('ronin', 'wildlife')).toBe(true);
    expect(d.loadout!.granted.has('ability.block')).toBe(false);
    expect(AIProfiles.get('ai.dummy').sight).toBe(0);
    const hero = new Spawner(new World(), new Rng(1)).spawnHero(0, 0);
    expect(d.health!.maxHp).toBeGreaterThan(hero.health!.maxHp * 20); // ~50 of the Ronin's cuts
  });
});
