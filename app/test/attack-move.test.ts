import { describe, expect, it } from 'vitest';
import { attackMoveSpeed } from '../src/combat/attackMove';
import { ATTACK_MOVE_STAT } from '../src/combat/stats';
import { StatBlock } from '../src/combat/StatBlock';
import type { Entity } from '../src/ecs/components';

/** A bare entity with just the fields attackMoveSpeed reads. `swinging` toggles the melee-in-flight marker. */
function actor(attackMoveMult?: number, swinging = false): Entity {
  const base = attackMoveMult !== undefined ? { [ATTACK_MOVE_STAT]: attackMoveMult } : {};
  const e = { id: 1, attributes: new StatBlock(base) } as unknown as Entity;
  if (swinging) e.melee = { ability: 'ability.cut', t: 0, dur: 0.5, motion: 'arc', phases: { windup: 0.4, active: 0.3, recover: 0.3 }, side: 1, angle: 0, hitByVolume: [] };
  return e;
}

describe('attackMoveSpeed — move penalty while a swing is in flight (the trait mechanic)', () => {
  it('not swinging → full speed regardless of the stat', () => {
    expect(attackMoveSpeed(actor(0, false), 100)).toBe(100); // rooted stat, but not swinging → unaffected
    expect(attackMoveSpeed(actor(1, false), 100)).toBe(100);
  });

  it('swinging with NO trait → rooted (default 0)', () => {
    expect(attackMoveSpeed(actor(undefined, true), 100)).toBe(0); // unset stat defaults to 0 = planted
  });

  it('swinging with Footwork (0.45) → slowed', () => {
    expect(attackMoveSpeed(actor(0.45, true), 100)).toBeCloseTo(45);
  });

  it('swinging with Flow (1.0) → full speed', () => {
    expect(attackMoveSpeed(actor(1, true), 100)).toBe(100);
  });
});
