import { Abilities } from '../combat/Ability';
import { HAND_R_FRAC, swingGeomOf, swingPose } from '../combat/swing';
import { harmableBy } from '../combat/targeting';
import { segDist } from '../core/math';
import { Weapons } from '../defs/layers';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { StrikeResolver } from './StrikeResolver';

/**
 * Resolves melee by CONTACT. While a `melee` swing is active, the user's fist/blade segment is a moving
 * hitbox; the frame it overlaps a hostile, the hit lands (each target struck once per swing). The same
 * swing drives the animation (drawActor → swingPose), so the visible weapon is the hitbox — a swing the
 * target steps out of simply whiffs. One engine: player and AI both attack this way. The hit itself is
 * delegated to StrikeResolver; this system owns only the moving-hitbox geometry.
 */
export class MeleeSystem {
  constructor(
    private readonly world: World,
    private readonly strikes: StrikeResolver,
  ) {}

  update(dt: number): void {
    for (const e of [...this.world.with('melee', 'transform')]) {
      const m = e.melee;
      if (!m) continue; // a hit earlier this same frame may have cancelled this swing (hitstun) — skip it
      m.t += dt;
      this.resolve(e);
      // detach: presence-as-state (widen past the narrowing) — but HOLD a launched swing whose landing
      // AoE hasn't fired yet (long knockback can outlive the swing; AbilitySystem fires the slam, then this frees)
      if (m.t >= m.dur && !(m.launched && !m.landed)) delete (e as Entity).melee;
    }
  }

  private resolve(e: Entity): void {
    const m = e.melee!;
    const t = e.transform!;
    const d = Abilities.get(m.ability);
    const shape = d.shape!;
    if (shape.noHit) return; // visual-only swing (Gomu Rocket's grab) — its damage is the landing AoE, not contact

    // flurry (Gomu Gatling): each jab is a fresh strike, so a target can be hit once PER jab (not once per swing)
    const jabs = shape.jabs ?? 1;
    if (m.motion === 'stretch' && jabs > 1) {
      const jab = Math.min(jabs - 1, Math.floor((m.t / Math.max(0.0001, m.dur)) * jabs));
      if (jab !== m.lastJab) {
        m.hit.length = 0;
        m.lastJab = jab;
      }
    }
    const wv = e.equipment?.weapon ? Weapons.get(e.equipment.weapon).visual : undefined;
    const hitR = wv ? wv.width / 2 + 3 : t.r * HAND_R_FRAC; // blade half-width, or the fist radius (shared w/ render)

    const pose = swingPose(m, shape, swingGeomOf(e)); // the SAME geom the renderer uses — drawn fist IS the hitbox
    const ax = t.x + pose.hx; // blade/fist segment in world space
    const ay = t.y + pose.hy;
    const bx = t.x + pose.tx;
    const by = t.y + pose.ty;

    const canHit = harmableBy(e);
    const base = this.strikes.baseDamage(e, d);
    const kb = d.knockback ?? 0;
    const kx = Math.cos(m.angle) * kb; // knock targets along the attack direction (forward)
    const ky = Math.sin(m.angle) * kb;

    for (const o of this.world.with('transform', 'health', 'faction')) {
      if (!canHit(o) || m.hit.includes(o.id)) continue; // shared harm predicate (enemies + huntable wildlife)
      const ot = o.transform!;
      if (segDist(ot.x, ot.y, ax, ay, bx, by) > ot.r + hitR) continue; // steel hasn't reached them yet
      m.hit.push(o.id); // count the contact even if it phases, so it isn't re-tested every frame
      this.strikes.hit(e, o, base, kx, ky, d.shake ?? 0, d.stun ?? 0);
      if (shape.single) break;
    }
  }
}
