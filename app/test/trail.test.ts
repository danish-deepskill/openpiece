import { describe, expect, it } from 'vitest';
import { Abilities, abilityProblem } from '../src/combat/Ability';
import { applyEffect } from '../src/combat/Effect';
import { hitVolumeProblem, volumeHits, type StrikeFrame } from '../src/combat/hitVolume';
import { swingGeomOf, swingPose } from '../src/combat/swing';
import { events, type SwingFx } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { weaponAnchor } from '../src/draw/actorDraws';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { MeleeSystem } from '../src/systems/MeleeSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

/**
 * THE TRAIL — a hit volume that is the PATH of a launched step, live only once the step has landed: the dash-through
 * cut that lands on everyone he passed, after he is behind them (Rashōmon, the game version). Plus crossCut, the motion
 * that poses BOTH blades: sheathed through the step, snapped into an X at the landing.
 */
const SIM = 1 / 60;
const RASHOMON = Abilities.get('ability.rashomon');

const frame = (fromX: number, fromY: number, x: number, y: number): StrikeFrame => ({ x, y, handX: x, handY: y, tipX: x, tipY: y, aim: 0, swingAngle: 0, segmentHalfW: 3, fromX, fromY });

function rig() {
  const world = new World();
  const sp = new Spawner(world, new Rng(3));
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const abilities = new AbilitySystem(world, new EffectSystem(world), strikes, new Rng(1));
  const melee = new MeleeSystem(world, strikes);
  const zoro = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
  applyEffect(zoro, 'effect.armament', 'test'); // the coated technique
  return { world, sp, abilities, melee, zoro };
}

describe('the trail volume — pure geometry', () => {
  it('a capsule from the step\'s origin to the body: on the line hits, beside it misses, past the end misses', () => {
    const v = { kind: 'trail', width: 44 } as const;
    const f = frame(0, 0, 200, 0);
    expect(volumeHits(v, f, 100, 20, 10)).toBe(true); // 20 ≤ 10 + 22
    expect(volumeHits(v, f, 100, 40, 10)).toBe(false); // 40 > 32: beside the path
    expect(volumeHits(v, f, 250, 0, 10)).toBe(false); // 50 past the landing: he never ran there
    expect(volumeHits(v, f, 0, 0, 10)).toBe(true); // the origin is on the path too
  });

  it('validates: width > 0; a trail row must be a LAUNCHED step (launchAt), or it would wait forever', () => {
    expect(hitVolumeProblem([{ kind: 'trail', width: 0 }])).toMatch(/width/);
    expect(hitVolumeProblem([{ kind: 'trail', width: 44 }])).toBeNull();
    expect(abilityProblem(RASHOMON)).toBeNull();
    expect(abilityProblem({ ...RASHOMON, launchAt: undefined })).toMatch(/launchAt/);
  });
});

describe('Rashōmon — nothing is cut on the way through; the path is cut once he has landed', () => {
  it('passed bodies take the hit after the landing (once), a body beside the line or past the stop does not; the trail FX fires with the cut', () => {
    const { sp, abilities, melee, zoro } = rig();
    expect(abilities.activate(zoro, 'ability.rashomon')).toBe(true);
    const m = zoro.melee!;
    const a = m.angle; // the committed line (aim + natural scatter) — place bodies along IT
    const along = (d: number, side = 0) => ({ x: Math.cos(a) * d - Math.sin(a) * side, y: Math.sin(a) * d + Math.cos(a) * side });
    const onPath = sp.spawnUnit('unit.dummy', along(120).x, along(120).y);
    const beside = sp.spawnUnit('unit.dummy', along(120, 70).x, along(120, 70).y);
    const beyond = sp.spawnUnit('unit.dummy', along(330).x, along(330).y);
    const hp = (e: typeof onPath) => e.health!.hp;
    const [h1, h2, h3] = [hp(onPath), hp(beside), hp(beyond)];
    const trails: SwingFx[] = [];
    const off = events.on('fx:swing', (fx) => { if (fx.type === 'trail') trails.push(fx); });

    // the cue: the step fires at the windup's end — the origin is recorded, the body is launched (dodgeT > 0)
    m.t = m.dur * m.phases.windup + 1e-6;
    abilities.update(SIM);
    expect(m.launches).toBe(1);
    expect([m.launchX, m.launchY]).toEqual([0, 0]);
    expect(zoro.mover!.dodgeT).toBeGreaterThan(0);
    expect(m.landed).toBeUndefined();

    // THROUGH them, still in flight (the active window is open — any other volume would already be cutting)
    m.t = m.dur * (m.phases.windup + 0.1);
    melee.update(SIM);
    expect(m.t / m.dur).toBeGreaterThan(m.phases.windup); // inside the trail's window…
    expect(hp(onPath)).toBe(h1); // …and still nobody is cut: the step has not landed
    expect(trails).toHaveLength(0);

    // the landing: he stands 240px down the line (MovementSystem would have carried him; the test places him), the impulse spent
    zoro.transform!.x = along(240).x;
    zoro.transform!.y = along(240).y;
    zoro.mover!.dodgeT = 0;
    abilities.update(SIM);
    expect(m.landed).toBe(true);
    expect(m.landedAt).toBeCloseTo(m.t, 9);
    melee.update(SIM);
    expect(hp(onPath)).toBeLessThan(h1); // the one he passed is cut — after he is behind him
    expect(hp(beside)).toBe(h2); // 70px off the line: the trail cuts the path, not the room
    expect(hp(beyond)).toBe(h3); // past where he stopped: he never ran there
    expect(trails).toHaveLength(1);
    expect(trails[0]!.len).toBeCloseTo(240, 6); // the drawn line IS the path: origin → landing
    expect(trails[0]!.theme).toBe('haki'); // a coated body's cut
    const after = hp(onPath);
    melee.update(SIM);
    expect(hp(onPath)).toBe(after); // once per target per volume
    off();
  });
});

describe('crossCut — both blades posed: sheathed through the step, an X at the landing, the body facing the aim throughout', () => {
  it('windup + flight: the hands draw BACK and both blades point behind him; the off blade follows the pose, not the guard', () => {
    const { abilities, zoro } = rig();
    expect(abilities.activate(zoro, 'ability.rashomon')).toBe(true);
    const m = zoro.melee!;
    m.t = m.dur * m.phases.windup; // sheathed, about to step
    const pose = swingPose(m, RASHOMON.shape!, swingGeomOf(zoro));
    expect(pose.drawAngle).toBeCloseTo(m.angle, 9); // the body still faces the target
    const back = (b: number) => Math.abs(Math.atan2(Math.sin(b - m.angle), Math.cos(b - m.angle))); // |blade − aim|
    expect(back(pose.bladeAngle!)).toBeGreaterThan(2.3); // the lead blade points behind him (≈ 0.85π)
    expect(pose.off).toBeDefined();
    expect(back(pose.off!.angle)).toBeGreaterThan(2.3); // so does the off blade
    const fwd = Math.cos(m.angle) * pose.hx + Math.sin(m.angle) * pose.hy; // the hand's forward component
    expect(fwd).toBeLessThan(0); // drawn back behind the shoulder line
    const offAnchor = weaponAnchor(zoro, -1)!;
    expect(offAnchor.x).toBeCloseTo(pose.off!.hx, 6); // the drawn off blade sits where the motion posed it
    expect(offAnchor.angle).toBeCloseTo(pose.off!.angle, 9);
    expect(weaponAnchor(zoro, 1)!.angle).toBeCloseTo(pose.bladeAngle!, 9); // the lead blade takes the blade angle, not the body's
  });

  it('landed: over the snap both blades open into an X ahead of him (lead one way, off the other), then settle', () => {
    const { abilities, zoro } = rig();
    expect(abilities.activate(zoro, 'ability.rashomon')).toBe(true);
    const m = zoro.melee!;
    m.t = m.dur * 0.55;
    m.landed = true;
    m.landedAt = m.t;
    m.t += m.dur * 0.1; // the snap is done
    const pose = swingPose(m, RASHOMON.shape!, swingGeomOf(zoro));
    const rel = (b: number) => Math.atan2(Math.sin(b - m.angle), Math.cos(b - m.angle));
    expect(rel(pose.bladeAngle!)).toBeCloseTo(-1.05, 2); // the lead blade out to one side…
    expect(rel(pose.off!.angle)).toBeCloseTo(1.05, 2); // …the off blade to the other: the X
    expect(pose.drawAngle).toBeCloseTo(m.angle, 9);
    m.t = m.dur * 0.999; // the end of the swing: settled back toward forward
    const end = swingPose(m, RASHOMON.shape!, swingGeomOf(zoro));
    expect(Math.abs(rel(end.bladeAngle!))).toBeLessThan(0.1);
  });
});
