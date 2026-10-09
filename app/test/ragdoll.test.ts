import { describe, expect, it } from 'vitest';
import { Abilities, abilityProblem, type AbilityDef } from '../src/combat/Ability';
import { TAG_PHASING, TAG_RAGDOLL, TAG_STUNNED } from '../src/combat/Effect';
import { isDowned, isRagdolled, PART_HEAD, PART_FIST_L, landRagdoll } from '../src/combat/ragdoll';
import { Rng } from '../src/core/Rng';
import { TERRAIN } from '../src/defs/terrains';
import { proneHead, rollHeadPlacement } from '../src/draw/rollAnim';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { BodyCollisionSystem } from '../src/systems/BodyCollisionSystem';
import { Damage } from '../src/systems/Damage';
import { MovementSystem } from '../src/systems/MovementSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';
import { Collision } from '../src/world/Collision';
import { SpatialQuery } from '../src/world/SpatialQuery';
import { TileGrid } from '../src/world/TileGrid';

const KOKUTO = Abilities.get('ability.kokutoIai');
const RAG = KOKUTO.ragdoll!;

function grass(): TileGrid {
  const g = new TileGrid(40, 40);
  g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => TERRAIN.grass));
  return g;
}
/** The Ronin (A-) lands Kokutō on a dummy (D-): nine bands down, three letters — the rung flings ×1.5 and keeps down ×2. */
function fling(targetTier?: string) {
  const world = new World();
  const sp = new Spawner(world, new Rng(4));
  const ronin = sp.spawnUnit('unit.ronin', 600, 640);
  const dummy = sp.spawnUnit('unit.dummy', 630, 640);
  if (targetTier) dummy.identity!.tier = targetTier as never;
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  const landed = strikes.hit(ronin, dummy, KOKUTO, 20, 100, 0, 0, KOKUTO.stun ?? 0);
  return { world, ronin, dummy, strikes, landed };
}

describe('ragdoll — the knockdown class: flight, then down, then up', () => {
  it('a Kokutō hit flings the dummy: tags, the tumble clock, the flight on the impulse channel, scaled by the rung', () => {
    const { dummy, landed } = fling();
    expect(landed).toBe(true);
    for (const tag of [TAG_RAGDOLL, TAG_STUNNED, TAG_PHASING]) expect(dummy.tags!.has(tag)).toBe(true);
    const m = dummy.mover!;
    expect(m.ragdoll).toMatchObject({ t: 0, air: RAG.airTime, down: RAG.downed * 2 }); // three letters down: downed ×2
    expect(m.dodgeT).toBeCloseTo(RAG.airTime, 6);
    expect(m.rollT).toBeCloseTo(RAG.airTime, 6); // the tumble rides the dodge-roll's clock
    expect(m.dvx).toBeCloseTo(RAG.force * 1.5, 6); // flung ×1.5 along the hit
    expect(m.dvy).toBeCloseTo(0, 6);
    expect(isRagdolled(dummy)).toBe(true);
    expect(isDowned(dummy)).toBe(false); // still flying
  });

  it('a body already flung or down is NOT re-launched or shoved — damage only (anti-juggle)', () => {
    const { dummy, ronin, strikes } = fling();
    const hp = dummy.health!.hp;
    const dvx = dummy.mover!.dvx;
    expect(strikes.hit(ronin, dummy, KOKUTO, 20, 100, 0, 0, 1.2)).toBe(true);
    expect(dummy.health!.hp).toBeLessThan(hp);
    expect(dummy.mover!.dvx).toBe(dvx); // no new fling, no shove
    expect(dummy.mover!.ragdoll!.t).toBe(0); // the same fall
  });

  it('a dominant body is never launched: the rung zeroes the shove, so the ragdoll is refused and nothing moves', () => {
    const { dummy } = fling('SS-'); // six bands above the uncoated ronin: two letters — the rung's knockbackMul is 0
    expect(dummy.tags!.has(TAG_RAGDOLL)).toBe(false);
    expect(dummy.mover!.ragdoll).toBeUndefined();
    expect(dummy.mover!.dvx).toBe(0);
  });

  it('the clock: flight ends into DOWNED, the sprawl has a head and a splay, then the get-up clears it', () => {
    const { world, dummy } = fling();
    const movement = new MovementSystem(world, new Collision(grass()));
    const dt = 1 / 60;
    expect(proneHead(dummy)).toBeNull(); // flying: no sprawl yet (the tumble draws)
    for (let i = 0; i < Math.ceil(RAG.airTime / dt) + 1; i++) movement.update(dt);
    expect(isDowned(dummy)).toBe(true);
    expect(dummy.mover!.ragdoll!.parts).toHaveLength(3); // the first downed tick laid the limbs out
    const s = proneHead(dummy)!;
    expect(Math.hypot(s.x, s.y)).toBeGreaterThan(dummy.transform!.r); // the head lies past the torso's end
    expect(rollHeadPlacement(dummy)).toMatchObject({ dx: s.x, dy: s.y, crownAlpha: 1 }); // the hat lies with it
    for (let i = 0; i < Math.ceil((RAG.downed * 2) / dt) + 2; i++) movement.update(dt);
    expect(dummy.mover!.ragdoll).toBeUndefined(); // up
    expect(isDowned(dummy)).toBe(false);
  });

  /** A landed dummy at (640, 640), lying along +x (head to the east), parts laid out, flight tags gone. */
  function downed() {
    const { world, dummy } = fling();
    const m = dummy.mover!;
    m.ragdoll!.t = RAG.airTime + 0.1;
    m.dodgeT = 0;
    dummy.tags!.remove(TAG_PHASING);
    dummy.transform!.x = 640;
    landRagdoll(m, dummy.transform!.r);
    return { world, dummy, bodies: new BodyCollisionSystem(world, new SpatialQuery(world), new Collision(grass())), movement: new MovementSystem(world, new Collision(grass())) };
  }

  it('a downed body is PUSHABLE at the trunk: a walker into the torso shoves it along and is not moved itself', () => {
    const { world, dummy, bodies } = downed();
    const walker = new Spawner(world, new Rng(9)).spawnUnit('unit.soldier', 630, 640); // overlapping the trunk from the west
    bodies.update();
    expect(dummy.transform!.x).toBeGreaterThan(640); // the downed one yields the whole overlap…
    expect(walker.transform!.x).toBeCloseTo(630, 1); // …the walker doesn't budge
    expect(dummy.mover!.dvx).toBeGreaterThan(0); // and it SLIDES along the push
  });

  it('PER PART, still connected: stepping into the HEAD moves the head, the joint pulls it back and DRAGS the torso', () => {
    const { world, dummy, bodies, movement } = downed();
    const m = dummy.mover!;
    const r = dummy.transform!.r;
    const head0 = { ...m.ragdoll!.parts![PART_HEAD]! };
    const fist0 = { ...m.ragdoll!.parts![PART_FIST_L]! };
    const headDist = Math.hypot(head0.x, head0.y);
    expect(headDist).toBeGreaterThan(r); // lies past the trunk (rolled off-axis by the seed, so not simply east)
    // a walker standing just beyond the head, along the head's own direction: overlaps the head part, clear of the trunk
    const ux = head0.x / headDist;
    const uy = head0.y / headDist;
    const walker = new Spawner(world, new Rng(9)).spawnUnit('unit.soldier', 640 + ux * (headDist + 8), 640 + uy * (headDist + 8));
    const tx0 = dummy.transform!.x;
    bodies.update();
    const headPushed = m.ragdoll!.parts![PART_HEAD]!;
    expect(Math.hypot(headPushed.x, headPushed.y)).toBeLessThan(headDist); // the head was shoved in toward the body…
    expect(m.ragdoll!.parts![PART_FIST_L]).toEqual(fist0); // …the fist the walker never touched didn't move
    expect(dummy.transform!.x).toBe(tx0); // the trunk itself wasn't pushed (the walker only met the head)
    expect(walker.transform!.x).toBeCloseTo(640 + ux * (headDist + 8), 6); // a limb has no mass to push back with
    movement.update(1 / 60); // the joints settle
    const d = Math.hypot(m.ragdoll!.parts![PART_HEAD]!.x - 0.5 * r * Math.cos(m.ragdoll!.angle), m.ragdoll!.parts![PART_HEAD]!.y - 0.5 * r * Math.sin(m.ragdoll!.angle));
    expect(d).toBeCloseTo(0.6 * r, 1); // back at the neck's length…
    expect(Math.hypot(dummy.transform!.x - tx0, dummy.transform!.y - 640)).toBeGreaterThan(0); // …and the torso was DRAGGED a share of the way by the joint
  });

  it('the row is validated: a ragdoll needs force > 0, airTime > 0, downed ≥ 0', () => {
    const base = { ...Abilities.get('ability.punch'), id: 'ability.testRag' } as AbilityDef;
    expect(abilityProblem({ ...base, ragdoll: { force: 0, airTime: 0.3, downed: 0.5 } })).toMatch(/ragdoll needs/);
    expect(abilityProblem({ ...base, ragdoll: { force: 500, airTime: 0.3, downed: 0 } })).toBeNull();
  });
});

describe('the sprawl is deterministic per fall', () => {
  it('two falls with different seeds lie differently; the same fall lays out the same', () => {
    const mk = (seed: number): Entity => ({ id: 1, transform: { x: 0, y: 0, angle: 0, r: 11 }, mover: { vx: 0, vy: 0, speed: 60, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0, ragdoll: { t: 1, air: 0.3, down: 1, angle: 0, seed } } }) as unknown as Entity;
    const lay = (seed: number) => { const e = mk(seed); landRagdoll(e.mover!, 11); return proneHead(e)!; };
    const a = lay(0.1);
    const b = lay(0.8);
    expect(a.y * b.y).toBeLessThan(0); // the head rolled to opposite sides
    expect(a.fists).not.toEqual(b.fists);
    expect(lay(0.1)).toEqual(a);
    expect(proneHead(mk(0.1))).toBeNull(); // not laid out yet (the first downed tick does it) → the tumble still draws
  });
});
