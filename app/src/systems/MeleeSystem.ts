import { Abilities } from '../combat/Ability';
import { strikeFrameOf, strikeVolumes, volumeHits } from '../combat/hitVolume';
import { swingGeomOf, swingPose } from '../combat/swing';
import { harmableBy } from '../combat/targeting';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { StrikeResolver } from './StrikeResolver';

/**
 * Resolves melee by CONTACT. While a `melee` swing is active, its resolved strike volumes
 * (combat/hitVolume — the weapon span, a free slash-arc, …) are moving hitboxes, each live only within its
 * `active` window of the swing; the frame one overlaps a hostile, the hit lands (once per volume — two
 * volumes may deliberately both connect). The same swing drives the animation (drawActor → swingPose), so
 * what you see drives what hits — a swing the target steps out of simply whiffs. One engine: player and AI
 * both attack this way. The hit itself is delegated to StrikeResolver; this system owns only the geometry.
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
    const d = Abilities.get(m.ability);
    const shape = d.shape!;
    if (shape.noHit) return; // visual-only swing (Gomu Rocket's grab) — its damage is the landing AoE, not contact

    // the swing's ACTIVE phase (resolved at cast): windowless volumes are live exactly here — an attack
    // deals no damage during its windup (the tell) or its recovery (the punish window)
    const phaseStart = m.phases.windup;
    const phaseEnd = m.phases.windup + m.phases.active;
    const volumes = strikeVolumes(e, d, [phaseStart, phaseEnd]); // ability ?? kit weapon ?? synthesized (memoized — no alloc)
    if (volumes.length === 0) return; // authored visual-only ([]) — nothing to test
    const p = m.dur > 0 ? Math.min(1, m.t / m.dur) : 1; // swing progress gates each volume's active window

    const pose = swingPose(m, shape, swingGeomOf(e)); // the SAME geom the renderer uses — you see what hits
    const frame = strikeFrameOf(e, m, d, pose); // shared with DebugOverlay — the overlay IS this geometry

    const canHit = harmableBy(e);
    const base = this.strikes.baseDamage(e, d);
    const kb = d.knockback ?? 0;
    const kx = Math.cos(m.angle) * kb; // knock targets along the attack direction (forward)
    const ky = Math.sin(m.angle) * kb;

    for (let vi = 0; vi < volumes.length; vi++) {
      const v = volumes[vi];
      const a0 = v.active ? v.active[0] : phaseStart; // authored windows stay ABSOLUTE (whole-swing fractions);
      const a1 = v.active ? v.active[1] : phaseEnd; //   windowless volumes inherit the active phase
      if (p < a0 || p > a1) continue; // this volume isn't live yet / anymore (p is monotonic — no reset needed)
      const hits = (m.hitByVolume[vi] ??= []); // per-volume once-only set (volumes may deliberately double-dip)
      for (const o of this.world.with('transform', 'health', 'faction')) {
        if (!canHit(o) || hits.includes(o.id)) continue; // shared harm predicate (enemies + huntable wildlife)
        const ot = o.transform!;
        if (!volumeHits(v, frame, ot.x, ot.y, ot.r)) continue; // steel/slash hasn't reached them yet
        hits.push(o.id); // count the contact even if it phases (Logia), so it isn't re-tested every frame
        this.strikes.hit(e, o, base, kx, ky, d.shake ?? 0, d.stun ?? 0);
        if (shape.single) return; // one landed hit per frame — same behavior the single-volume model had
      }
    }
  }
}
