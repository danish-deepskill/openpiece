import { describe, expect, it } from 'vitest';
import { Abilities, type AbilityDef, type AbilityShape } from '../src/combat/Ability';
import { strikeVolumes, volumeHits, type StrikeFrame } from '../src/combat/hitVolume';
import { StatBlock } from '../src/combat/StatBlock';
import { Rng } from '../src/core/Rng';
import { Weapons } from '../src/defs/layers';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { Damage } from '../src/systems/Damage';
import { MeleeSystem } from '../src/systems/MeleeSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

// a hammer that only hurts with its HEAD — the case the old hand→tip-segment model couldn't express
Weapons.register({
  id: 'weapon.testHammer',
  name: 'Test Hammer',
  weaponClass: 'heavy',
  primary: 'ability.punch',
  visual: { kind: 'club', length: 40, width: 8, color: 0x8a7a6a }, // a melee weapon must draw something: its length is its reach (the Weapons validator)
  modifiers: [],
  tags: [],
  hitVolumes: [{ kind: 'weaponSegment', from: 0.85 }],
});

const BARE = {} as Entity; // strikeVolumes only reads equipment — safe stub for the unarmed chain
const WHOLE: readonly [number, number] = [0, 1]; // an all-active span (phase-neutral for chain tests)
/** Minimal def wrapper — strikeVolumes resolves by the ABILITY (its id gates the weapon rung). */
const def = (shape: AbilityShape, id = 'ability.x'): AbilityDef => ({ id, name: 'X', cooldown: 0, shape });

describe('strikeVolumes — the override chain (ability ?? kit weapon ?? synthesized)', () => {
  const armed = { equipment: { weapon: 'weapon.testHammer', potentials: [] } } as unknown as Entity;

  it('an ability\'s own volumes win over the weapon\'s (arrays replace wholesale)', () => {
    const own = [{ kind: 'arc', radius: 60, halfAngle: 0.5, thickness: 20 }] as const;
    expect(strikeVolumes(armed, def({ arc: 0, swing: 'melee', hitVolumes: [...own] }, 'ability.punch'), WHOLE)[0].kind).toBe('arc');
    expect(strikeVolumes(armed, def({ arc: 0, swing: 'melee' }, 'ability.punch'), WHOLE)).toBe(Weapons.get('weapon.testHammer').hitVolumes);
  });

  it("the weapon rung applies ONLY to the weapon's own kit — a kick can't inherit the blade's dead zone", () => {
    // 'ability.punch' IS the test hammer's primary (in kit) → hammer volumes; a kick is NOT → default
    expect(strikeVolumes(armed, def({ arc: 0, swing: 'melee' }, 'ability.kick'), WHOLE)).toEqual([{ kind: 'weaponSegment' }]);
    // and a flurry keeps its per-jab windows instead of being preempted by the weapon's volumes
    const flurry = strikeVolumes(armed, def({ arc: 0, swing: 'melee', jabs: 4 }, 'ability.gomuGatling'), WHOLE);
    expect(flurry).toHaveLength(4);
  });

  it('an explicitly EMPTY list means a visual-only swing (not a fall-through)', () => {
    expect(strikeVolumes(BARE, def({ arc: 0, swing: 'melee', hitVolumes: [] }), WHOLE)).toEqual([]);
  });

  it('bare default = the whole drawn weapon; jabs > 1 synthesize one volume per jab window IN the active span', () => {
    const whole = strikeVolumes(BARE, def({ arc: 0, swing: 'melee' }), WHOLE);
    expect(whole).toEqual([{ kind: 'weaponSegment' }]);
    const jabs = strikeVolumes(BARE, def({ arc: 0, swing: 'melee', jabs: 4 }), WHOLE);
    expect(jabs).toHaveLength(4);
    expect(jabs[0].active).toEqual([0, 0.25]); // the Gatling flurry, expressed as windows (no bespoke reset code)
    expect(jabs[3].active).toEqual([0.75, 1]);
    expect(strikeVolumes(BARE, def({ arc: 0, swing: 'melee', jabs: 4 }), WHOLE)).toBe(jabs); // memoized — no per-frame alloc
    // a real phase clock: jabs pulse only through the ACTIVE span (matching the pumping arms)
    const phased = strikeVolumes(BARE, def({ arc: 0, swing: 'melee', jabs: 4 }), [0.1, 0.9]);
    expect(phased[0].active).toEqual([0.1, 0.30000000000000004]); // 0.1 + (1/4)·0.8 — windup is hit-free
    expect(phased[3].active?.[1]).toBeCloseTo(0.9, 10);
  });
});

describe('volumeHits — pure geometry per volume kind', () => {
  const F: StrikeFrame = { x: 0, y: 0, handX: 0, handY: 0, tipX: 100, tipY: 0, aim: 0, swingAngle: 0, segmentHalfW: 5 };

  it('weaponSegment spans from→to along the drawn weapon (hammer head hits, its handle does not)', () => {
    expect(volumeHits({ kind: 'weaponSegment' }, F, 50, 8, 5)).toBe(true); // whole weapon: mid-handle reaches
    expect(volumeHits({ kind: 'weaponSegment', from: 0.85 }, F, 50, 0, 5)).toBe(false); // head-only: handle is inert
    expect(volumeHits({ kind: 'weaponSegment', from: 0.85 }, F, 90, 0, 5)).toBe(true); // the head connects
    expect(volumeHits({ kind: 'weaponSegment', width: 2 }, F, 50, 8, 5)).toBe(false); // width override narrows the test
  });

  it('arc is a free crescent band, decoupled from the blade, facing aim or the travelling swing', () => {
    const arc = { kind: 'arc', radius: 60, halfAngle: 0.5, thickness: 20 } as const;
    expect(volumeHits(arc, F, 50, 0, 5)).toBe(true); // inside the band, on the aim line
    expect(volumeHits(arc, F, 10, 0, 5)).toBe(false); // inside the inner edge — the slash passes OVER them
    expect(volumeHits(arc, F, 70, 0, 5)).toBe(false); // beyond the outer edge
    const off = { x: Math.cos(0.8) * 50, y: Math.sin(0.8) * 50 }; // 0.8 rad off the aim, in-band distance
    expect(volumeHits(arc, F, off.x, off.y, 5)).toBe(false); // outside the aim-facing crescent…
    expect(volumeHits({ ...arc, follow: 'swing' }, { ...F, swingAngle: 0.8 }, off.x, off.y, 5)).toBe(true); // …but the TRAVELLING cut reaches them
  });
});

describe('MeleeSystem — timed volumes through a real swing', () => {
  Abilities.register({
    id: 'ability.testTwinWindow',
    name: 'Twin Window',
    cooldown: 1,
    damageStat: 'atk',
    // one swing, two strike moments — a target caught through the whole swing is hit at BOTH windows
    shape: { arc: 0.3, swing: 'melee', swingTime: 0.4, hitVolumes: [
      { kind: 'weaponSegment', active: [0, 0.3] },
      { kind: 'weaponSegment', active: [0.6, 1] },
    ] },
  });
  Abilities.register({
    id: 'ability.testDoubleDip',
    name: 'Double Dip',
    cooldown: 1,
    damageStat: 'atk',
    // two volumes live simultaneously — per-volume hits mean BOTH may connect on the same target (deliberate)
    shape: { arc: 0.3, swing: 'melee', swingTime: 0.4, hitVolumes: [
      { kind: 'weaponSegment' },
      { kind: 'arc', radius: 40, halfAngle: 1, thickness: 40 },
    ] },
  });

  function arena(ability: string) {
    const world = new World();
    const attacker = world.create({
      transform: { x: 0, y: 0, angle: 0, r: 12 },
      faction: { id: 'bandits' },
      attributes: new StatBlock({ atk: 5, reach: 34 }),
      combatant: { stam: 100, maxStam: 100, combo: 0, comboT: 0, posture: 0, maxPosture: 20 },
      melee: { ability, t: 0, dur: 0.4, motion: 'stab', phases: { windup: 0, active: 1, recover: 0 }, side: 1, angle: 0, hitByVolume: [] },
    });
    const target = world.create({
      transform: { x: 20, y: 0, angle: 0, r: 14 },
      faction: { id: 'civilians' }, // bandits are hostile to civilians — harmable
      health: { hp: 100, maxHp: 100, dead: false, hitFlash: 0, iframes: 0 },
    });
    return { world, attacker, target, ms: new MeleeSystem(world, new StrikeResolver(new Damage(), new Rng(1))) };
  }

  it('a two-window swing lands two hits at two different MOMENTS on a lingering target', () => {
    const { attacker, target, ms } = arena('ability.testTwinWindow');
    for (let i = 0; i < 4; i++) ms.update(0.05); // p → 0.5: only window 1 has been live
    expect(attacker.combatant!.combo).toBe(1); // exactly one hit so far
    for (let i = 0; i < 4; i++) ms.update(0.05); // p → 1.0: window 2 opens and connects
    expect(attacker.combatant!.combo).toBe(2); // the second, separate hit
    expect(target.health!.hp).toBe(89); // 5 (atk) then 5+1 (combo) — two strikes, not one
  });

  it('two simultaneously-live volumes may BOTH hit the same target (per-volume dedup, not per-swing)', () => {
    const { attacker, ms } = arena('ability.testDoubleDip');
    ms.update(0.05); // one frame: segment + arc each overlap → two hits, once each
    expect(attacker.combatant!.combo).toBe(2);
    ms.update(0.05); // next frame: both volumes already hit this target — nothing new
    expect(attacker.combatant!.combo).toBe(2);
  });
});
