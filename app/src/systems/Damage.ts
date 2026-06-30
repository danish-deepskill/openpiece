import type { Entity } from '../ecs/components';
import type { FxSystem } from './FxSystem';

/**
 * The single place damage is applied. Used by both the player's CombatSystem and AI brains
 * (via AIContext.applyDamage) so every attacker resolves hits identically — part of the
 * "every character uses the same system" Moat.
 */
export class Damage {
  constructor(private readonly fx: FxSystem) {}

  apply(target: Entity, dmg: number, kx: number, ky: number, byPlayer = false): boolean {
    const h = target.health;
    const t = target.transform;
    if (!h || !t || h.dead || h.iframes > 0 || target.tags?.has('state.invuln')) return false;

    // flat damage reduction from the target's `def` attribute (tier/gear-driven); always lands for ≥1
    const def = target.attributes?.get('def') ?? 0;
    dmg = Math.max(1, dmg - def);
    h.hp -= dmg;
    h.hitFlash = 0.12;
    // Knockback as a brief decaying impulse (collision-respected by MovementSystem) instead of a 1-frame
    // teleport — so it reads as a real shove the target's AI/input can't instantly cancel. Same for everyone.
    const m = target.mover;
    if (m) {
      m.dvx = kx;
      m.dvy = ky;
      m.dodgeT = Math.max(m.dodgeT, 0.12); // brief hitstun while the impulse carries
    }
    // moverless targets (e.g. a docked ship) are immovable — no knockback
    this.fx.dmgText(t.x, t.y - t.r - 6, dmg, byPlayer ? '#ffd4d4' : '#ffffff');
    this.fx.burst(t.x, t.y, 0xc0303a, 6, 160);
    if (h.hp <= 0) h.dead = true;
    return true;
  }
}
