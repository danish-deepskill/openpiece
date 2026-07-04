import { describe, expect, it } from 'vitest';
import { ANATOMY, BODY_FRAME_R, SLOT_ANCHOR } from '../src/draw/actorDraws';

/**
 * The humanoid silhouette budget as an executable contract: the drawn body must stay honest to the
 * collision circle (the hitbox IS just transform.r), and the perspective model's reads — head away from
 * facing, crescent/slabs toward it — must survive proportion tuning. Tune ANATOMY freely; these are the fences.
 */
describe('ANATOMY — the silhouette stays honest to the hitbox circle', () => {
  const A = ANATOMY;

  it('widest extent (shoulders) stays within the 1.2·r visual budget', () => {
    expect(A.shoulderOut + A.shoulderHalfW).toBeLessThanOrEqual(1.2);
  });

  it('torso facing-side extent stays within budget', () => {
    expect(A.torsoFwd + A.torsoHalfL).toBeLessThanOrEqual(1.25);
    expect(A.torsoHalfW).toBeLessThanOrEqual(1.2);
  });

  it('the head never draws outside the collision circle (the part you aim at IS hittable)', () => {
    expect(A.headBack + A.headR).toBeLessThanOrEqual(1.0);
  });

  it('the torso crescent actually peeks out on the FACING side (the orientation read exists)', () => {
    expect(A.torsoFwd + A.torsoHalfL).toBeGreaterThan(A.headR - A.headBack);
  });

  it('shoulders peek sideways past the head (the pauldron mounts are visible)', () => {
    expect(A.shoulderOut + A.shoulderHalfW).toBeGreaterThan(A.headR);
  });

  it("the torso's far edge hides under the head (no ledge poking out behind)", () => {
    expect(A.torsoHalfL - A.torsoFwd).toBeLessThanOrEqual(A.headBack + A.headR);
  });

  it('the body authoring frame covers the whole silhouette (artists never draw off-template)', () => {
    expect(BODY_FRAME_R).toBeGreaterThanOrEqual(A.shoulderOut + A.shoulderHalfW);
    expect(BODY_FRAME_R).toBeGreaterThanOrEqual(A.torsoFwd + A.torsoHalfL);
    expect(BODY_FRAME_R).toBeGreaterThanOrEqual(1); // and the collision circle itself
  });

  it('every slot anchor pins inside the authoring frame', () => {
    for (const f of Object.values(SLOT_ANCHOR)) expect(Math.abs(f)).toBeLessThanOrEqual(BODY_FRAME_R);
  });
});
