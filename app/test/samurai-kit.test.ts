import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { attackMoveSpeed } from '../src/combat/attackMove';
import { Rng } from '../src/core/Rng';
import { Accessories } from '../src/defs/accessories';
import { Weapons } from '../src/defs/layers';
import { accessoryDraws } from '../src/draw/accessoryDraws';
import { bodyDrawAngle } from '../src/draw/actorDraws';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';

describe('unit.samurai — the katana kit lands on every slot through the one equip path', () => {
  it('spawns at C, as a pirate, with kesa / iai / shukuchi / kiai and the whole chain granted', () => {
    const e = new Spawner(new World(), new Rng(1)).spawnUnit('unit.samurai', 0, 0);
    expect(e.identity!.tier).toBe('C');
    expect(e.faction!.id).toBe('pirates'); // hostile to Marines, neutral to the player
    const lo = e.loadout!;
    expect(lo.primary).toBe('ability.kesa');
    expect(lo.heavy).toBe('ability.iai'); // the weapon's own heavy, not the base kick
    expect(lo.dash).toBe('ability.shukuchi');
    expect(lo.utilities).toEqual(['ability.kiai']);
    expect(lo.slots[0]).toBe('ability.kamaitachi'); // the ulti on key 1
    expect(lo.granted.has('ability.kiriage')).toBe(true); // the chain's second cut is granted with the entry
    expect(lo.granted.has('ability.tsuki')).toBe(true); // … and its third (a thrust)
    expect(lo.granted.has('ability.kirioroshi')).toBe(true); // the heavy chain's second
    expect(lo.granted.has('ability.parry')).toBe(true); // guard ON — parrying is his character
    expect(e.hold!.slots).toBe(10);
    expect(e.accessories!.slots.head).toBe('accessory.kasa'); // the hat is worn from spawn
    const v = Accessories.get('accessory.kasa').visual;
    expect(v.kind).toBe('procedural');
    if (v.kind === 'procedural') expect(accessoryDraws[v.draw]).toBeDefined(); // the draw key resolves (the boot sweep's headless twin)
    expect(e.accessories!.slots.chest).toBe('accessory.sode'); // the shoulder guards — visual only
    const sode = Accessories.get('accessory.sode');
    expect(sode.modifiers ?? []).toHaveLength(0); // no stats: armor-with-stats is a later pass
    if (sode.visual.kind === 'procedural') expect(accessoryDraws[sode.visual.draw]).toBeDefined();
    expect(sode.follows).toBe('body'); // armor rides the torso's swing twist …
    expect(Accessories.get('accessory.kasa').follows ?? 'aim').toBe('aim'); // … a hat faces the cursor
    expect(Accessories.get('accessory.kasa').rotates ?? true).toBe(true);
  });

  it('his PASSIVE (Footwork): mid-swing he keeps exactly half his speed where a plain unit is rooted', () => {
    const w = new World();
    const sp = new Spawner(w, new Rng(1));
    const samurai = sp.spawnUnit('unit.samurai', 0, 0);
    const bandit = sp.spawnUnit('unit.bandit', 60, 0);
    expect(attackMoveSpeed(samurai, 100)).toBe(100); // not swinging — full speed, like anyone
    samurai.melee = { ability: 'ability.kesa', t: 0, dur: 0.4, motion: 'arc', phases: { windup: 0.5, active: 0.25, recover: 0.25 }, side: 1, angle: 0, hitByVolume: [] };
    bandit.melee = { ...samurai.melee, ability: 'ability.stab' };
    expect(attackMoveSpeed(samurai, 100)).toBe(50); // Footwork: half stride through the cut
    expect(attackMoveSpeed(bandit, 100)).toBe(0); // the base case: plant your feet to commit
  });

  it('bodyDrawAngle is the aim at rest and the swing\'s TWISTED angle mid-cut (what body-mounted armor follows)', () => {
    const world = new World();
    const e = new Spawner(world, new Rng(1)).spawnUnit('unit.samurai', 0, 0);
    e.transform!.angle = 0.3;
    expect(bodyDrawAngle(e)).toBe(0.3); // idle: the aim
    const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)); // no contact resolved here
    expect(abilities.activate(e, 'ability.kesa')).toBe(true);
    e.melee!.t = e.melee!.dur * 0.5; // the cut's active phase: the torso is twisted toward the sweep
    expect(bodyDrawAngle(e)).not.toBeCloseTo(e.transform!.angle, 3);
  });

  it('the two heavies read differently: the draw is narrow from the lead side, the finish wide from the off side', () => {
    const iai = Abilities.get('ability.iai').shape!;
    const fin = Abilities.get('ability.kirioroshi').shape!;
    expect(iai.mirror ?? false).toBe(false);
    expect(fin.mirror).toBe(true); // from the other side
    expect(fin.arc).toBeGreaterThan(iai.arc * 2); // a visibly wider sweep
    expect(fin.hitVolumes?.some((v) => v.kind === 'arc')).toBe(true); // the wave the FX draws
    expect(Abilities.get('ability.tsuki').shape!.pattern).toBe('line'); // the third LMB press is a thrust
  });

  it('the chains: kesa → kiri-age → tsuki on LMB, iai → kirioroshi on RMB; the iai carries the guard-breaking posture', () => {
    expect(Abilities.get('ability.kesa').comboNext).toBe('ability.kiriage');
    expect(Abilities.get('ability.kiriage').comboNext).toBe('ability.tsuki'); // three cuts on LMB
    expect(Abilities.get('ability.tsuki').comboNext).toBeUndefined();
    expect(Abilities.get('ability.iai').comboNext).toBe('ability.kirioroshi'); // two on RMB
    expect(Abilities.get('ability.iai').posture).toBe(20);
    expect(Abilities.get('ability.iai').shape?.chargeHold).toBe(true);
  });

  it('the katana art the row names exists on disk (BootScene loads it by this path)', () => {
    const v = Weapons.get('weapon.katana').visual;
    expect(v?.kind).toBe('sprite');
    if (v?.kind === 'sprite') expect(existsSync(join(__dirname, '..', 'src', 'art', v.art))).toBe(true);
  });
});
