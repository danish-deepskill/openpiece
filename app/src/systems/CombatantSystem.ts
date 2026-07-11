import { isRanged } from '../combat/equip';
import { Weapons } from '../defs/layers';
import { POSTURE_REGEN } from '../combat/guard';
import {
  SPREAD_AIM_MIN,
  SPREAD_BLOOM_TAU,
  SPREAD_HIP,
  SPREAD_MOVE_PENALTY,
  SPREAD_SETTLE_TAU,
  STAM_REGEN,
} from '../config/constants';
import { smoothFactor } from '../core/math';
import type { World } from '../ecs/World';

/** A body is "moving" for spread purposes above this px/s — a slow drift shouldn't fully bloom the cone. */
const SPREAD_MOVE_EPS = 8;

/** Per-frame upkeep of shared combat resources — stamina (delayed regen), combo decay, hitstun, posture and
 *  the parry timers — every combatant (the guard is not player-only: the Moat). */
export class CombatantSystem {
  constructor(private readonly world: World) {}

  update(dt: number): void {
    for (const e of this.world.with('combatant')) {
      const c = e.combatant!;
      if (c.comboT > 0) {
        c.comboT -= dt;
        if (c.comboT <= 0) c.combo = 0;
      }
      // (CC clocks live on the EFFECT system now — EffectSystem ticks effect.staggered/stunned/…; the gates
      //  read the granted state tags. No bespoke timers here.)
      // stamina regen waits out the post-spend delay, THEN refills — so it only recovers when you're not fighting
      if (c.regenT && c.regenT > 0) c.regenT = Math.max(0, c.regenT - dt);
      else if (c.stam < c.maxStam) c.stam = Math.min(c.maxStam, c.stam + STAM_REGEN * dt);
      // guard upkeep: the parry window closes, the whiff cooldown re-arms, and posture recovers ONLY while
      // the guard is DOWN — holding block banks the strain (turtling is a slowly-losing position by design)
      if (c.parryT && c.parryT > 0) c.parryT = Math.max(0, c.parryT - dt);
      if (c.parryCd && c.parryCd > 0) c.parryCd = Math.max(0, c.parryCd - dt);
      if (!c.blocking && c.posture > 0) c.posture = Math.max(0, c.posture - POSTURE_REGEN * dt);
      // AIM SPREAD (ranged only): ease the live cone toward its target — narrow when aiming + still, wide when
      // hip-firing / moving. ASYMMETRIC: blooms fast toward a WIDER target, tightens slow toward a NARROWER one
      // (managing the cone is the skill). Only run for a ranged holder; others carry no spread.
      if (isRanged(e)) {
        // Two tiers of disruption while AIMING: WALKING adds a moderate penalty (a middle ground — aiming on
        // the move is wider than planted but still tighter than hip); a JUMP or ROLL is a BIGGER disruption (a
        // flip fully throws off your bead), so it blooms the target all the way to the hip ceiling. Not aiming
        // = hip (the max). SPREAD_HIP is the CEILING nothing exceeds; the final clamp holds recoil-kick to it too.
        const mv = e.mover;
        const flipping = mv ? mv.layer === 'air' || (mv.rollT ?? 0) > 0 : false; // jump / roll = full disruption
        const walking = mv ? Math.hypot(mv.vx, mv.vy) > SPREAD_MOVE_EPS : false; // a step = moderate
        // PER-WEAPON ACCURACY (WeaponDef.accuracy): a crude musket sprays WIDER (spreadMul) + settles SLOWER
        // (settleMul) than a drilled one. Both default 1 (baseline). Cheap lookup — one ranged holder per frame.
        const acc = e.equipment?.weapon ? Weapons.get(e.equipment.weapon).accuracy : undefined;
        const spreadMul = acc?.spreadMul ?? 1;
        const settleMul = acc?.settleMul ?? 1;
        const hip = SPREAD_HIP * spreadMul; // this weapon's ceiling (wider for a crude gun)
        let target: number;
        if (!c.aiming) target = hip;
        else if (flipping) target = hip; // a jump/roll disrupts as much as hip-firing
        else if (walking) target = (SPREAD_AIM_MIN + SPREAD_MOVE_PENALTY) * spreadMul; // the middle ground
        else target = SPREAD_AIM_MIN * spreadMul; // aimed + planted = tightest (still scaled — a crude gun never gets AS tight)
        const cur = c.spread ?? hip;
        const tau = target > cur ? SPREAD_BLOOM_TAU : SPREAD_SETTLE_TAU * settleMul; // widen fast; tighten slow (slower still for a crude gun)
        const eased = cur + (target - cur) * smoothFactor(1 / tau, dt); // exp ease (frame-rate independent)
        c.spread = Math.min(eased, hip); // clamp to THIS weapon's ceiling
      } else if (c.spread !== undefined || c.aiming) {
        // weapon swapped away mid-life: clear the ranged aim state, or the LAST cone/aim pose lingers forever
        // (the debug overlay then draws an accuracy cone on a swordsman — the stale-spread bug).
        c.spread = undefined;
        c.aiming = false;
      }
    }
  }
}
