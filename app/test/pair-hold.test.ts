import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { activeSide, guardHand, swingGeomOf, swingPose } from '../src/combat/swing';
import { Rng } from '../src/core/Rng';
import { isPair, weaponProblem, Weapons, type WeaponDef } from '../src/defs/layers';
import { guardGrip, weaponAnchor, weaponHands } from '../src/draw/actorDraws';
import { coatedKey, offArtKey, weaponTextureKey, weaponTextureKeys } from '../src/draw/coating';
import type { MeleeSwing } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * THE PAIR HOLD (WeaponDef.grip.hold 'each'): one def, a blade in each hand. The hold is the ONE fact everything else
 * derives from — which hands grip, which blade a cut comes from, how many sprites, how the guard crosses — so a
 * two-sword style can't be "two blades drawn, one blade hitting".
 */

const rig = () => {
  const world = new World();
  const sp = new Spawner(world, new Rng(3));
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)); // contact never resolves here
  return { world, sp, abilities, zoro: sp.spawnUnit('unit.zoroAdvanced', 0, 0), ronin: sp.spawnUnit('unit.ronin', 300, 0) };
};

const pairRow = (over: Partial<WeaponDef>): WeaponDef => ({ ...Weapons.get('weapon.nitoryu'), ...over });

describe('the hold is data, validated at the row', () => {
  it("'each' is a blade in each hand — it needs two hands; the off art is only drawn for a pair", () => {
    expect(weaponProblem(Weapons.get('weapon.nitoryu'))).toBeNull();
    expect(weaponProblem(pairRow({ grip: { hands: 1, hold: 'each' } }))).toMatch(/hands: 2/);
    expect(weaponProblem(pairRow({ grip: { hands: 2, hold: 'shared' } }))).toMatch(/offArt/); // the nitoryu visual keeps offArt → a shared hold may not carry it
    expect(weaponProblem(Weapons.get('weapon.katana'))).toBeNull(); // the shared two-handed hold, unchanged
  });

  it('isPair reads the hold; the swing geometry carries it; the drawn hands follow', () => {
    const { zoro, ronin } = rig();
    expect(isPair('weapon.nitoryu')).toBe(true);
    expect(isPair('weapon.katanaElite')).toBe(false);
    expect(isPair(undefined)).toBe(false);
    expect(swingGeomOf(zoro).pair).toBe(true);
    expect(swingGeomOf(ronin).pair).toBe(false);
    expect(weaponHands(zoro)).toEqual([1, -1]);
    expect(weaponHands(ronin)).toEqual([1]);
  });
});

describe('a flurry under the pair hold: lead blade, then off blade — each cut from its own hand', () => {
  const toro = Abilities.get('ability.saiKuru'); // the four-cut charge (Tōrō itself became a scissor — both blades at once; test/nigiri)
  const ph = toro.shape!.phases!;
  const swing = (p: number): MeleeSwing => ({ ability: 'ability.saiKuru', t: p, dur: 1, motion: 'flurry', phases: ph, side: 1, angle: 0, hitByVolume: [] });
  const cut0 = ph.windup + ph.active * (0.5 / 4); // inside window 0 of 4
  const cut1 = ph.windup + ph.active * (1.5 / 4); // inside window 1

  it('activeSide alternates under the pair hold and holds the lead hand for one blade', () => {
    const { zoro, ronin } = rig();
    expect(activeSide(swing(cut0), toro.shape!, swingGeomOf(zoro))).toBe(1);
    expect(activeSide(swing(cut1), toro.shape!, swingGeomOf(zoro))).toBe(-1);
    expect(activeSide(swing(cut1), toro.shape!, swingGeomOf(ronin))).toBe(1); // a single blade never hops hands
  });

  it('the cutting hand carries the pose; the other blade waits at ITS guard — the drawn blade is the hitbox', () => {
    const { zoro, abilities } = rig();
    expect(abilities.activate(zoro, 'ability.saiKuru')).toBe(true);
    const m = zoro.melee!;
    const r = zoro.transform!.r;
    for (const [p, cutting] of [[cut0, 1], [cut1, -1]] as const) {
      m.t = p * m.dur;
      const pose = swingPose(m, toro.shape!, swingGeomOf(zoro));
      const act = weaponAnchor(zoro, cutting)!;
      expect(act.x).toBeCloseTo(pose.hx, 6); // the acting blade IS the pose's hand (what MeleeSystem hits with)
      expect(act.y).toBeCloseTo(pose.hy, 6);
      const idle = weaponAnchor(zoro, cutting === 1 ? -1 : 1)!;
      const [gx, gy] = guardHand(pose.drawAngle, -cutting, r);
      expect(idle.x).toBeCloseTo(gx, 6); // the other blade is UP at guard, not dropped to the hip
      expect(idle.y).toBeCloseTo(gy, 6);
    }
  });

  it('every cut window of the flurry lands from a different hand than the last (the row and the seam agree)', () => {
    const { zoro } = rig();
    const g = swingGeomOf(zoro);
    const vols = toro.shape!.hitVolumes!;
    expect(vols).toHaveLength(4);
    const hands = vols.map((v) => activeSide(swing((v.active![0] + v.active![1]) / 2), toro.shape!, g));
    expect(hands).toEqual([1, -1, 1, -1]);
  });
});

describe('idle, guard and the two sprites', () => {
  it('idle: one blade per hand at that hand\'s rest spot, mirrored across the aim', () => {
    const { zoro } = rig();
    const lead = weaponAnchor(zoro, 1)!;
    const off = weaponAnchor(zoro, -1)!;
    expect(lead.x).toBeCloseTo(off.x, 6); // aim 0: the rest hands sit at the same depth…
    expect(lead.y).toBeCloseTo(-off.y, 6); // …on opposite sides
  });

  it('block: the blades CROSS — mirrored grips, mirrored tilts', () => {
    const { zoro } = rig();
    zoro.combatant!.blocking = true;
    const lead = weaponAnchor(zoro, 1)!;
    const off = weaponAnchor(zoro, -1)!;
    const r = zoro.transform!.r;
    const [lx, ly] = guardGrip(0, r, 1);
    const [ox, oy] = guardGrip(0, r, -1);
    expect([lead.x, lead.y]).toEqual([lx, ly]);
    expect([off.x, off.y]).toEqual([ox, oy]);
    expect(lead.angle).toBeCloseTo(-off.angle, 6); // one tilted across from the left, one from the right — an X
    expect(lead.angle).not.toBe(0);
  });

  it('texture keys: the off hand draws its own art under the off key; the coating bakes both', () => {
    const w = Weapons.get('weapon.nitoryu');
    expect(weaponTextureKey(w, 1)).toBe('weapon.nitoryu');
    expect(weaponTextureKey(w, -1)).toBe(offArtKey('weapon.nitoryu'));
    expect(weaponTextureKeys(w)).toEqual(['weapon.nitoryu', 'weapon.nitoryu:off']);
    expect(weaponTextureKeys(Weapons.get('weapon.katana'))).toEqual(['weapon.katana']); // one blade, one key
    expect(coatedKey(offArtKey('weapon.nitoryu'), 'haki')).toBe('weapon.nitoryu:off:haki');
  });
});

describe('ONE blade is untouched by the seam', () => {
  it('a mirrored single-blade step (the Samurai\'s Kiriage swings from the off side) keeps the sword ON the pose hand', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(9));
    const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));
    const samurai = sp.spawnUnit('unit.samurai', 0, 0);
    expect(abilities.activate(samurai, 'ability.kiriage')).toBe(true); // mirror: true → side −1
    const m = samurai.melee!;
    expect(m.side).toBe(-1);
    m.t = m.dur * (m.phases.windup + m.phases.active / 2); // mid-cut
    const pose = swingPose(m, Abilities.get('ability.kiriage').shape!, swingGeomOf(samurai));
    const a = weaponAnchor(samurai)!;
    expect(a.x).toBeCloseTo(pose.hx, 6); // the drawn sword IS the hitbox, whichever hand throws it
    expect(a.y).toBeCloseTo(pose.hy, 6);
    expect(weaponHands(samurai)).toEqual([1]);
  });
});
