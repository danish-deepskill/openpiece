import { FX_COLOR, KNOCKBACK_CARRY } from '../config/constants';
import { events } from '../core/EventBus';
import type { Entity } from '../ecs/components';

/**
 * The single place damage is applied. Every hit funnels here through StrikeResolver (melee contact,
 * pistol cones, landing AoEs) so every attacker resolves damage identically — part of the
 * "every character uses the same system" Moat.
 */
export class Damage {

  apply(target: Entity, dmg: number, kx: number, ky: number, byPlayer = false): boolean {
    const h = target.health;
    const t = target.transform;
    // 'state.godMode' = the debug invincibility tag (like 'state.invuln' dodge i-frames, but persistent)
    if (!h || !t || h.dead || h.iframes > 0 || target.tags?.has('state.invuln') || target.tags?.has('state.godMode')) return false;

    // flat damage reduction from the target's `def` attribute (tier/gear-driven); always lands for ≥1
    const def = target.attributes?.get('def') ?? 0;
    dmg = Math.max(1, dmg - def);
    h.hp -= dmg;
    h.hitFlash = 0.12;
    // Knockback as a brief decaying impulse (collision-respected by MovementSystem) instead of a 1-frame
    // teleport — so it reads as a real shove the target's AI/input can't instantly cancel. Same for everyone.
    const m = target.mover;
    if (m) {
      const rubber = target.tags?.has('fruit.gomu.rubber') ? 0.25 : 1; // rubber body barely budges
      m.dvx = kx * rubber;
      m.dvy = ky * rubber;
      m.dodgeT = Math.max(m.dodgeT, KNOCKBACK_CARRY); // the impulse carries briefly (same rule for everyone)
    }
    // moverless targets (e.g. a docked ship) are immovable — no knockback
    events.emit('fx:dmgText', { x: t.x, y: t.y - t.r - 6, value: dmg, color: byPlayer ? '#ffd4d4' : '#ffffff' });
    events.emit('fx:burst', { x: t.x, y: t.y, color: FX_COLOR.blood, n: 6, speed: 160 });
    if (h.hp <= 0) h.dead = true;
    return true;
  }
}
