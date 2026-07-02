import { Abilities, abilityRange, type AbilityDef } from '../combat/Ability';
import { spendStamina } from '../combat/stamina';
import { harmableBy } from '../combat/targeting';
import { FX_COLOR } from '../config/constants';
import { events } from '../core/EventBus';
import { angleDiff, dist, norm } from '../core/math';
import type { Rng } from '../core/Rng';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { EffectSystem } from './EffectSystem';
import type { StrikeResolver } from './StrikeResolver';

/** Per-strike aim error (rad), centred toward 0 — natural imprecision so combat isn't a perfect lock.
 *  (Could become a per-unit `accuracy` stat later: skilled fighters tighten this.) */
const AIM_SPREAD = 0.18;

/**
 * Resolves abilities for any actor with a `loadout` — the single attack path (the old CombatSystem folded
 * in here). Damage scales off the user's Attributes, so all four combat layers feed one resolution.
 */
export class AbilitySystem {
  constructor(
    private readonly world: World,
    private readonly effects: EffectSystem,
    private readonly strikes: StrikeResolver,
    private readonly rng: Rng, // the seeded `combat` stream: scatter / motion picks (determinism)
  ) {}

  /** Decrement every loadout's ability cooldowns. (Combatant resource upkeep lives in CombatantSystem.) */
  update(dt: number): void {
    for (const e of this.world.with('loadout')) {
      const cd = e.loadout!.cd;
      for (const [k, v] of cd) {
        const n = v - dt;
        if (n <= 0) cd.delete(k);
        else cd.set(k, n);
      }
    }
    // deferred launches (Gomu Rocket): fire the body-impulse once the grab-arm has reached forward
    for (const e of this.world.with('melee', 'mover', 'transform')) {
      const m = e.melee!;
      const d = Abilities.get(m.ability);
      if (!d.selfImpulse) continue;
      if (!m.launched && d.launchAt !== undefined && m.t / m.dur >= d.launchAt) {
        m.launched = true; // the grab reached forward → rocket the body
        this.launch(e, m.angle, d.selfImpulse, d.impulseDur ?? 0.16);
      } else if (m.launched && !m.landed && d.shape?.landRadius !== undefined && e.mover!.dodgeT <= 0) {
        m.landed = true; // the leap has stopped → slam the area it landed in
        this.landAoe(e, d);
      }
    }
  }

  /** Gomu Rocket landing: a slam AoE where the body stops — damage + outward knockback to hostiles in radius. */
  private landAoe(e: Entity, d: AbilityDef): void {
    const t = e.transform!;
    const radius = d.shape!.landRadius!;
    const canHit = harmableBy(e);
    const base = this.strikes.baseDamage(e, d);
    const kb = d.knockback ?? 0;
    events.emit('fx:burst', { x: t.x, y: t.y, color: FX_COLOR.spark, n: 22, speed: 320 });
    if (d.shake) events.emit('fx:shake', { amount: d.shake }); // one shake for the slam impact (data opt-in)
    for (const o of this.world.with('transform', 'health', 'faction')) {
      if (!canHit(o)) continue;
      const ot = o.transform;
      const dx = ot.x - t.x;
      const dy = ot.y - t.y;
      const gap = Math.hypot(dx, dy); // NOT `dist` — that would shadow the core/math import used below
      if (gap > radius + ot.r) continue;
      const inv = gap > 0.01 ? 1 / gap : 0; // knock each target radially outward from the impact
      this.strikes.hit(e, o, base, dx * inv * kb, dy * inv * kb, 0, d.stun ?? 0); // no per-target shake; the slam shook once above
    }
  }

  ready(e: Entity, id: string): boolean {
    const lo = e.loadout;
    if (!lo || !lo.granted.has(id)) return false;
    if ((lo.cd.get(id) ?? 0) > 0) return false;
    const d = Abilities.get(id);
    if (d.costStam && (e.combatant?.stam ?? 0) < d.costStam) return false; // can't use what you can't afford
    if (d.blockTags && e.tags && d.blockTags.some((t) => e.tags!.has(t))) return false;
    if (d.requireTags && (!e.tags || !d.requireTags.every((t) => e.tags!.has(t)))) return false;
    return true;
  }

  activate(e: Entity, id: string): boolean {
    if ((e.combatant?.stunT ?? 0) > 0) return false; // staggered (hitstun) — can't act
    if (!this.ready(e, id)) return false;
    const d = Abilities.get(id);
    if (d.costStam && e.combatant) spendStamina(e.combatant, d.costStam); // spend + regen pause, one rule
    // attack speed is a tier stat: effective recovery = base cooldown / atkSpeed (default 1)
    const atkSpeed = Math.max(0.1, e.attributes?.get('atkSpeed') ?? 1);
    e.loadout!.cd.set(id, d.cooldown / atkSpeed);
    if (d.grantEffect) this.effects.apply(e, d.grantEffect, id);
    if (d.shape) {
      if (d.shape.swing === 'pistol') this.resolveHit(e, d); // ranged: instant shot
      else this.startSwing(e, id, d); // melee: a moving hitbox MeleeSystem resolves on contact
    }
    // immediate dash (dodge/flash); a launchAt ability defers its impulse until mid-swing (grab → THEN rocket)
    if (d.selfImpulse && d.launchAt === undefined) this.impulse(e, d.selfImpulse, d.impulseDur ?? 0.16);
    return true;
  }

  /** A small centred random aim error so no strike is a perfect lock (biased toward 0; rarely wide). */
  private scatter(angle: number): number {
    return angle + (this.rng.next() - this.rng.next()) * AIM_SPREAD;
  }

  /** Begin a melee swing — the animated fist/blade becomes the hitbox (see MeleeSystem). */
  private startSwing(e: Entity, id: string, d: AbilityDef): void {
    const shape = d.shape!;
    const pat = shape.pattern ?? 'arc';
    // resolve to a concrete motion archetype; 'mixed' picks once HERE so the render + hitbox agree all swing
    const motion = pat === 'mixed' ? (this.rng.chance(0.5) ? 'stab' : 'arc') : pat === 'line' ? 'stab' : pat;
    const stretch = motion === 'stretch';
    const foot = shape.limb === 'foot';
    let side: number;
    if (foot && e.combatant) {
      // alternate kicking feet so consecutive kicks visibly MIRROR (left → right → left …), like real kicks
      e.combatant.kickSide = -(e.combatant.kickSide ?? -1);
      side = e.combatant.kickSide;
    } else if (!stretch && e.equipment?.weapon) {
      side = 1; // armed hand swings use the weapon hand
    } else if (e.combatant) {
      // alternate throwing hands like the feet above (right → left → right …) — a random pick reads as a
      // stutter whenever two swings happen to land on the same side back-to-back
      e.combatant.handSide = -(e.combatant.handSide ?? -1);
      side = e.combatant.handSide;
    } else {
      side = 1; // combatant-less swinger (not spawned via Spawner) — lead hand
    }
    e.melee = {
      ability: id,
      t: 0,
      dur: shape.swingTime ?? 0.18,
      motion,
      side,
      angle: this.scatter(e.transform!.angle), // committed aim + natural scatter — moving still makes it whiff
      hit: [],
      lastJab: stretch ? -1 : undefined,
    };
  }

  /** Rocket the body along `angle` (Gomu Rocket) — a far, committed leap, longer-carrying than a dodge hop. */
  private launch(e: Entity, angle: number, speed: number, dur: number): void {
    const m = e.mover!;
    m.dvx = Math.cos(angle) * speed;
    m.dvy = Math.sin(angle) * speed;
    m.dodgeT = dur; // per-ability carry (Gomu Rocket sets a long leap in its def)
    events.emit('fx:burst', { x: e.transform!.x, y: e.transform!.y, color: 0xffffff, n: 12, speed: 240 });
  }

  private impulse(e: Entity, speed: number, dur: number): void {
    const t = e.transform!;
    const m = e.mover!;
    let dx = m.vx;
    let dy = m.vy;
    if (dx === 0 && dy === 0) {
      dx = Math.cos(t.angle);
      dy = Math.sin(t.angle);
    }
    const [nx, ny] = norm(dx, dy);
    m.dvx = nx * speed;
    m.dvy = ny * speed;
    m.dodgeT = dur; // short hop by default; abilities tune it via impulseDur
    events.emit('fx:burst', { x: t.x, y: t.y, color: 0xffffff, n: 8, speed: 160 });
  }

  /** Instant ranged shot (pistol): a cone test from the muzzle; each chosen target resolved via StrikeResolver. */
  private resolveHit(e: Entity, d: AbilityDef): void {
    const t = e.transform!;
    const shape = d.shape!;
    const canHit = harmableBy(e);
    const base = this.strikes.baseDamage(e, d);
    const range = abilityRange(d, e.attributes?.get('reach') ?? 0);
    const aim = this.scatter(t.angle); // the shot scatters slightly off true aim
    events.emit('fx:swing', { type: 'pistol', x: t.x, y: t.y, angle: aim, len: range, life: 0.16, max: 0.16, arc: shape.arc });

    const targets = this.world
      .with('transform', 'health', 'faction')
      .filter(canHit)
      .sort((a, b) => dist(t.x, t.y, a.transform!.x, a.transform!.y) - dist(t.x, t.y, b.transform!.x, b.transform!.y));

    const kb = d.knockback ?? 0;
    for (const o of targets) {
      const ot = o.transform!;
      const rx = ot.x - t.x;
      const ry = ot.y - t.y;
      if (dist(t.x, t.y, ot.x, ot.y) > range + ot.r) continue;
      if (Math.abs(angleDiff(Math.atan2(ry, rx), aim)) >= shape.arc) continue;
      const [nx, ny] = norm(rx, ry);
      this.strikes.hit(e, o, base, nx * kb, ny * kb, d.shake ?? 0, d.stun ?? 0);
      if (shape.single) break; // single-target shot stops at the nearest in the cone (hit or phased)
    }
  }
}
