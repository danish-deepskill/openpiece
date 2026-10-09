import { TAG_RAGDOLL } from '../combat/Effect';
import { DAMAGE_TAKEN_STAT } from '../combat/stats';
import { FX_COLOR, KNOCKBACK_CARRY } from '../config/constants';
import { events } from '../core/EventBus';
import type { Entity } from '../ecs/components';

/**
 * The single place damage is applied. Every hit funnels here through StrikeResolver (melee contact,
 * pistol cones, landing AoEs) so every attacker resolves damage identically — part of the
 * "every character uses the same system" Moat.
 */
export class Damage {

  /** `ignoreDef` = TRUE (environmental) damage — drowning, and future fall/poison/lava: it bypasses armor AND the
   *  dodge i-frame/invuln guard (you can't armor or dodge-roll away from the sea filling your lungs). godMode
   *  (the debug tag) still ignores everything. */
  apply(target: Entity, dmg: number, kx: number, ky: number, byPlayer = false, ignoreDef = false): boolean {
    const h = target.health;
    const t = target.transform;
    // 'state.godMode' = the debug invincibility tag (like 'state.invuln' dodge i-frames, but persistent)
    if (!h || !t || h.dead || target.tags?.has('state.godMode')) return false;
    if (!ignoreDef && (h.iframes > 0 || target.tags?.has('state.invuln'))) return false; // combat hits respect i-frames; TRUE damage doesn't

    // HARDENING first (the damage-taken MULTIPLIER — Armament's ×0.5: the coating takes half the blow), then the flat
    // `def` subtraction (tier/gear toughness) — armor resists strikes, NOT environmental TRUE damage (drowning). Always
    // lands for ≥1. The multiplier reads 1 on every spawned body (stats.MULTIPLIER_STAT_SEEDS); a body with no stats takes it all.
    if (!ignoreDef) dmg *= target.attributes?.get(DAMAGE_TAKEN_STAT) ?? 1;
    const def = ignoreDef ? 0 : (target.attributes?.get('def') ?? 0);
    dmg = Math.max(1, dmg - def);
    h.hp -= dmg;
    h.hitFlash = 0.12;
    // Knockback as a brief decaying impulse (collision-respected by MovementSystem) instead of a 1-frame
    // teleport — so it reads as a real shove the target's AI/input can't instantly cancel. Same for everyone.
    const m = target.mover;
    if (m && !target.tags?.has(TAG_RAGDOLL)) { // a flung or downed body is not shoved again (combat/ragdoll — the anti-juggle rule)
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
