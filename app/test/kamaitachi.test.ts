import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { flurryWindows } from '../src/combat/hitVolume';
import { flurryCuts } from '../src/combat/swing';
import { attackMoveSpeed } from '../src/combat/attackMove';
import { activeWindow, resolvePhases } from '../src/combat/phases';
import { strikeVolumes } from '../src/combat/hitVolume';
import { swingGeomOf, swingPose } from '../src/combat/swing';
import { applyEffect } from '../src/combat/Effect';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

function rig() {
  const world = new World();
  const e = new Spawner(world, new Rng(1)).spawnUnit('unit.samurai', 0, 0);
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const abilities = new AbilitySystem(world, new EffectSystem(world), strikes, new Rng(1));
  return { world, e, abilities, strikes };
}
const endSwing = (e: Entity): void => { delete e.melee; };

describe('the katana chains — LMB three cuts, RMB two', () => {
  it('LMB walks kesa → kiri-age → tsuki, then the root locks for tsuki\'s recovery', () => {
    const { e, abilities } = rig();
    const root = 'ability.kesa';
    expect(abilities.activate(e, root)).toBe(true);
    expect(e.melee!.ability).toBe('ability.kesa');
    endSwing(e);
    expect(abilities.activate(e, root)).toBe(true);
    expect(e.melee!.ability).toBe('ability.kiriage');
    endSwing(e);
    expect(abilities.activate(e, root)).toBe(true);
    expect(e.melee!.ability).toBe('ability.tsuki');
    endSwing(e);
    expect(e.loadout!.chain).toBeUndefined();
    expect(e.loadout!.cd.get(root)).toBeCloseTo(1.4 / 1.45, 6); // tsuki's cooldown over the samurai's attack speed
    expect(abilities.activate(e, root)).toBe(false); // locked out until it elapses
  });

  it('under Kiai the post-combo lockout is HALVED (on top of the attack-speed cut); each step keeps its own cooldown', () => {
    const { e, abilities } = rig();
    applyEffect(e, 'effect.kiai', 'test');
    const atkSpeed = e.attributes!.get('atkSpeed'); // 1.45 × 1.3
    expect(atkSpeed).toBeCloseTo(1.45 * 1.3, 6);
    const root = 'ability.kesa';
    abilities.activate(e, root);
    expect(e.loadout!.cd.get(root)).toBeCloseTo(0.8 / atkSpeed, 6); // the first cut's OWN cooldown — not halved
    endSwing(e);
    abilities.activate(e, root);
    endSwing(e);
    abilities.activate(e, root);
    endSwing(e);
    expect(e.loadout!.cd.get(root)).toBeCloseTo((1.4 / atkSpeed) * 0.5, 6); // the finisher's lockout, halved
  });

  it('RMB walks iai → kirioroshi inside the iai\'s longer window', () => {
    const { e, abilities } = rig();
    expect(Abilities.get('ability.iai').comboWindow).toBeGreaterThan(0.9); // the iai swing is 0.9s at speed 1 — the default window would never chain
    expect(abilities.activate(e, 'ability.iai')).toBe(true);
    endSwing(e);
    expect(abilities.activate(e, 'ability.iai')).toBe(true);
    expect(e.melee!.ability).toBe('ability.kirioroshi');
  });
});

describe('Kamaitachi — the rooted six-second channel: cuts, large sweeps, wind slashes, the big wind last', () => {
  it('lands one window per planned cut, in order, the big wind arc last', () => {
    const { e } = rig();
    const d = Abilities.get('ability.kamaitachi');
    expect(d.shape!.jabs).toBeUndefined(); // no hand-synced twin of the cut count — the windows ARE the count (flurryCuts)
    const vols = strikeVolumes(e, d, activeWindow(resolvePhases(e, d)));
    expect(vols).toHaveLength(flurryCuts(d.shape!)); // the motion + the FX whip exactly once per window — ONE source
    for (let i = 1; i < vols.length; i++) expect(vols[i]!.active![0]).toBeCloseTo(vols[i - 1]!.active![1], 6); // back to back, no gap, no overlap
    const last = vols[vols.length - 1]!;
    expect(last.kind).toBe('arc');
    if (last.kind === 'arc') {
      expect(last.radius).toBe(120); // the big wind's OUTER edge: ~4 tiles (an arc band is radius−thickness → radius)
      expect(last.radius - last.thickness).toBe(24); // … starting just outside the body
    }
    expect(vols.slice(0, -1).filter((v) => v.kind === 'arc')).toHaveLength(5); // the plan's five LARGE sweeps
    expect(vols.slice(0, -1).filter((v) => v.kind === 'arc').every((v) => v.damageMul === 2)).toBe(true); // … each hitting DOUBLE a cut
    expect(vols.filter((v) => v.kind === 'weaponSegment').every((v) => v.damageMul === undefined)).toBe(true);
    expect(vols.slice(0, -1).filter((v) => v.kind === 'weaponSegment')).toHaveLength(25); // 20 plain cuts + 5 slash cuts
    expect(vols[0]!.active![0]).toBeCloseTo(resolvePhases(e, d).windup, 6); // the first cut starts when the tell ends
    expect(d.volleys).toHaveLength(5); // five wind slashes
    for (let i = 1; i < d.volleys!.length; i++) expect(d.volleys![i]!.at).toBeGreaterThan(d.volleys![i - 1]!.at);
    expect(Abilities.get(d.volleys![0]!.ability).shape?.swing).toBe('shot');
  });

  it('each cut deals a small share (damageMul), so the whole channel is a commitment, not an execution', () => {
    const { e, strikes } = rig();
    const d = Abilities.get('ability.kamaitachi');
    const full = strikes.baseDamage(e, Abilities.get('ability.kesa')) - 3; // kesa = atk + 3 flat → atk
    expect(strikes.baseDamage(e, d)).toBeCloseTo(full * d.damageMul!, 6);
    expect(flurryCuts(d.shape!) * d.damageMul!).toBeLessThan(8); // all cuts landing < 8 full hits — survivable for a C- bar
  });

  it('looses each wind slash ONCE as the swing crosses its cue, along the blade, as its own shot', () => {
    const { world, e, abilities } = rig();
    const d = Abilities.get('ability.kamaitachi');
    expect(abilities.activate(e, 'ability.kamaitachi')).toBe(true);
    const m = e.melee!;
    const shots = (): Entity[] => [...world.entities].filter((o) => o.projectile);
    m.t = m.dur * (d.volleys![0]!.at - 0.001); // just before the first cue
    abilities.update(0);
    expect(shots()).toHaveLength(0);
    m.t = m.dur * (d.volleys![0]!.at + 0.001); // just past it
    abilities.update(0);
    expect(shots()).toHaveLength(1);
    expect(shots()[0]!.projectile!.ability).toBe('ability.kamaitachiSlash');
    expect(shots()[0]!.projectile!.owner).toBe(e.id);
    abilities.update(0); // same progress — no double fire
    expect(shots()).toHaveLength(1);
    m.t = m.dur; // the whole channel
    abilities.update(0);
    expect(shots()).toHaveLength(5);
    expect(m.volleysFired).toBe(5);
    // forward, but FANNED: no two slashes on one line, every one within the spread of the aim (+ the shooter's own aim-cone scatter)
    const headings = shots().map((o) => Math.atan2(o.projectile!.vy, o.projectile!.vx));
    expect(new Set(headings.map((h) => h.toFixed(4))).size).toBeGreaterThan(1);
    const spread = d.volleys![0]!.spread!;
    for (const h of headings) expect(Math.abs(h - m.angle)).toBeLessThanOrEqual(spread + 0.6);
  });

  it('flurryWindows: a plan maps c/L/S to blade / large arc / blade+volley, with the finisher last', () => {
    const out = flurryWindows('cLS', 0, 1, { large: { kind: 'arc', radius: 1, halfAngle: 1, thickness: 1 }, finisher: { kind: 'arc', radius: 2, halfAngle: 1, thickness: 1 }, shot: 'ability.kamaitachiSlash', shotSpread: 0.2 });
    expect(out.hitVolumes.map((v) => v.kind)).toEqual(['weaponSegment', 'arc', 'weaponSegment', 'arc']);
    expect(out.volleys).toEqual([{ at: 0.5, ability: 'ability.kamaitachiSlash', spread: 0.2 }]); // the 'S' window starts at 2/4
    expect(() => flurryWindows('cx', 0, 1, { large: { kind: 'arc', radius: 1, halfAngle: 1, thickness: 1 }, finisher: { kind: 'arc', radius: 2, halfAngle: 1, thickness: 1 }, shot: 'ability.kamaitachiSlash', shotSpread: 0.2 })).toThrow(/unknown plan glyph/);
  });

  it('is ROOTED: Footwork\'s half stride does not apply during the channel', () => {
    const { e, abilities } = rig();
    expect(abilities.activate(e, 'ability.kesa')).toBe(true);
    expect(attackMoveSpeed(e, 100)).toBe(50); // the trait: half stride through a normal cut
    endSwing(e);
    expect(abilities.activate(e, 'ability.kamaitachi')).toBe(true);
    expect(attackMoveSpeed(e, 100)).toBe(0); // the channel plants him
  });

  it('the flurry motion alternates the blade\'s sweep direction cut by cut and holds the cock through the windup', () => {
    const { e, abilities } = rig();
    expect(abilities.activate(e, 'ability.kamaitachi')).toBe(true);
    const m = e.melee!;
    const shape = Abilities.get('ability.kamaitachi').shape!;
    const g = swingGeomOf(e);
    const at = (p: number): number => {
      m.t = p * m.dur;
      return swingPose(m, shape, g).drawAngle - m.angle; // the blade's offset from the aim
    };
    const w = m.phases.windup;
    const a = m.phases.active;
    const cock = at(w * 0.5);
    expect(cock).toBeGreaterThan(0);
    expect(at(w * 0.9)).toBeCloseTo(cock, 6); // held — the charge tell doesn't drift
    const cuts = flurryCuts(shape);
    const quarter = (cut: number): number => at(w + (a * (cut + 0.25)) / cuts); // a quarter into cut N
    expect(quarter(0)).toBeGreaterThan(0); // cut 0 starts on the + side …
    expect(quarter(1)).toBeLessThan(0); // … cut 1 comes back from the − side
    expect(quarter(2)).toBeGreaterThan(0);
    expect(Math.abs(at(0.999))).toBeLessThan(Math.abs(cock)); // settling toward center through recovery
  });
});
