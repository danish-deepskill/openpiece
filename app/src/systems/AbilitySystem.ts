import { Abilities, abilityRange, type AbilityDef } from '../combat/Ability';
import { phaseAt, resolvePhases } from '../combat/phases';
import { spendStamina } from '../combat/stamina';
import { harmableBy } from '../combat/targeting';
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

  /** Decrement every loadout's ability cooldowns + combo-chain windows. (Combatant resource upkeep lives
   *  in CombatantSystem.) */
  update(dt: number): void {
    for (const e of this.world.with('loadout')) {
      const lo = e.loadout!;
      const cd = lo.cd;
      for (const [k, v] of cd) {
        const n = v - dt;
        if (n <= 0) cd.delete(k);
        else cd.set(k, n);
      }
      if (lo.chain) {
        lo.chain.until -= dt;
        if (lo.chain.until <= 0) delete lo.chain; // window closed — the next press restarts the chain
      }
    }
    // deferred launches (Gomu Rocket) + AoE slams (Gomu Ono): fire the body-impulse / area slam at its cue.
    for (const e of this.world.with('melee', 'mover', 'transform')) {
      const m = e.melee;
      if (!m) continue; // the snapshot can go stale: landAoe → a PARRIED slam deletes this entity's melee mid-loop
      const d = Abilities.get(m.ability);
      if (d.selfImpulse) {
        // LAUNCH ability (Rocket): rocket the body once the grab reached forward; on landing, slam the AoE IF it
        // has one — else just mark landed (a pure-movement leap like the new Rocket has no AoE, but MUST still set
        // `landed` or MeleeSystem keeps the swing alive forever waiting for a slam that never comes → the actor is
        // stuck rooted mid-swing, unable to move/act. The `landed` flag is the "leap resolved" signal either way).
        if (!m.launched && d.launchAt !== undefined && m.t / m.dur >= d.launchAt) {
          m.launched = true;
          this.launch(e, m.angle, d.selfImpulse, d.impulseDur ?? 0.16);
        } else if (m.launched && !m.landed && e.mover!.dodgeT <= 0) {
          m.landed = true;
          if (d.shape?.landRadius !== undefined) this.landAoe(e, d); // slam only if the ability authors one
        }
      } else if (d.shape?.pattern === 'axe' && d.shape.landRadius !== undefined && !m.landed) {
        // AXE-KICK (Ono): the leg rises through the windup, then the foot CRASHES down — slam the AoE the instant
        // the swing crosses into its ACTIVE phase (foot hits the ground). No impulse: he stays put and stomps.
        if (m.t / m.dur >= m.phases.windup) {
          m.landed = true;
          this.landAoe(e, d);
        }
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
    events.emit('fx:ring', { x: t.x, y: t.y, radius: radius * 1.15, color: 0xffffff, life: 0.35 }); // the slam SHOCKWAVE — white, matching the sword-finisher slash-wave; expands past the AoE edge and fades
    events.emit('debug:aoe', { x: t.x, y: t.y, radius }); // the overlay draws this radius briefly (debug only)
    if (d.shake) events.emit('fx:shake', { amount: d.shake }); // one shake for the slam impact (data opt-in)
    for (const o of this.world.with('transform', 'health', 'faction')) {
      if (!canHit(o)) continue;
      const ot = o.transform;
      const dx = ot.x - t.x;
      const dy = ot.y - t.y;
      const gap = Math.hypot(dx, dy); // NOT `dist` — that would shadow the core/math import used below
      if (gap > radius + ot.r) continue;
      const inv = gap > 0.01 ? 1 / gap : 0; // knock each target radially outward from the impact
      this.strikes.hit(e, o, d, base, dx * inv * kb, dy * inv * kb, 0, d.stun ?? 0); // no per-target shake; the slam shook once above
    }
  }

  ready(e: Entity, id: string): boolean {
    const lo = e.loadout;
    if (!lo || !lo.granted.has(id)) return false;
    if ((lo.cd.get(id) ?? 0) > 0) return false;
    const d = Abilities.get(id);
    if (d.costStam && (e.combatant?.stam ?? 0) < d.costStam && !e.tags?.has('state.godMode')) return false; // can't use what you can't afford (god mode: free)
    if (d.blockTags && e.tags && d.blockTags.some((t) => e.tags!.has(t))) return false;
    if (d.requireTags && (!e.tags || !d.requireTags.every((t) => e.tags!.has(t)))) return false;
    return true;
  }

  activate(e: Entity, id: string): boolean {
    if ((e.combatant?.stunT ?? 0) > 0) return false; // staggered (hitstun) — can't act
    const lo = e.loadout;
    // combo chain: a repeat press of the same slot inside the window fires the NEXT step instead of
    // restarting — gates (cooldown/cost/granted) are checked against the step that actually fires
    let actual = id;
    if (lo?.chain && lo.chain.root === id) {
      if (lo.granted.has(lo.chain.next)) actual = lo.chain.next;
      else delete lo.chain; // stale chain (weapon swapped mid-combo) — fall back to the pressed ability
    }
    if (!this.ready(e, actual)) return false;
    const d = Abilities.get(actual);
    // a swing is a COMMITMENT: no new melee swing (or chain step) starts while one is in flight. LMB is
    // level-sampled per sim step — without this gate one held click would machine-gun a whole combo chain,
    // each step bypassing the previous one's cooldown (steps are distinct abilities with cold cooldowns).
    if (d.shape && d.shape.swing !== 'pistol' && e.melee) return false;
    // A DODGE (self-impulse) can only cancel a swing during its WINDUP — the same commitment gate as the feint
    // (guard.tryGuard): while winding up you can still abort (roll OR feint), but once the cut is ACTIVE/RECOVER
    // it's COMMITTED and the roll is REFUSED — no free "attack, then roll out of the punish". Refused here (early)
    // so a roll that can't fire spends no stamina/cooldown. (launchAt abilities like Rocket ARE their own swing —
    // no separate melee is in flight when they're pressed — so this only gates a dodge pressed DURING a swing.)
    if (d.selfImpulse && d.launchAt === undefined && e.melee) {
      const s = e.melee;
      const prog = s.dur > 0 ? Math.min(1, s.t / s.dur) : 1;
      if (phaseAt(s.phases, prog) !== 'windup') return false; // committed cut — can't dodge out of your own follow-through
    }
    // attacking DROPS the guard (the mirror of the feint: you can't cut and cover at once) — the parry
    // window dies with it, so guard-then-swing can't smuggle a free deflection into an attack
    if (e.combatant?.blocking) {
      e.combatant.blocking = false;
      e.combatant.parryT = 0;
    }
    const god = e.tags?.has('state.godMode') === true; // debug: free abilities — no stamina, no cooldown
    if (!god && d.costStam && e.combatant) spendStamina(e.combatant, d.costStam); // spend + regen pause, one rule
    // attack speed is a tier stat: effective recovery = base cooldown / atkSpeed (default 1)
    const atkSpeed = Math.max(0.1, e.attributes?.get('atkSpeed') ?? 1);
    lo!.cd.set(actual, god ? 0 : d.cooldown / atkSpeed); // `!` safe: ready() above returns false when loadout is absent
    // chain bookkeeping: arm the next step — or, on a chain's FINAL step, lock the ROOT for this step's
    // cooldown too (the post-combo recovery; without it the chain would restart the instant it finishes)
    if (lo) {
      if (d.comboNext) lo.chain = { root: id, next: d.comboNext, until: d.comboWindow ?? 0.9 };
      else {
        if (actual !== id) lo.cd.set(id, god ? 0 : d.cooldown / atkSpeed); // lock the chain ROOT for the finisher's recovery (god mode: no lock)
        if (lo.chain?.root === id) delete lo.chain;
      }
    }
    if (d.grantEffect) this.effects.apply(e, d.grantEffect, actual);
    if (d.shape) {
      if (d.shape.swing === 'pistol') this.resolveHit(e, d); // ranged: instant shot
      else this.startSwing(e, actual, d); // melee: a moving hitbox MeleeSystem resolves on contact
    }
    // immediate dash (dodge/flash); a launchAt ability defers its impulse until mid-swing (grab → THEN rocket)
    if (d.selfImpulse && d.launchAt === undefined) {
      // a dodge BUYS OUT of a swing in flight: the attack is forfeited for the escape (without this, the
      // hitbox would slide along with the dash — a free drive-by; commitment must be escapable, not portable)
      if (e.melee) delete e.melee;
      const dur = d.impulseDur ?? 0.16;
      this.impulse(e, d.selfImpulse, dur);
      if (d.roll && e.mover) { e.mover.rollT = dur; e.mover.rollDur = dur; } // start the roll-anim clock (drawActor reads it)
    }
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
    // resolve to a concrete motion archetype; 'mixed' ALTERNATES stab↔swing each swing (deterministic — a
    // coin flip read as an inconsistent stutter), the same rhythm the R→L hand alternation uses. Picked ONCE
    // here so the render + hitbox agree all swing.
    let motion: string;
    if (pat === 'mixed') {
      const stab = e.combatant ? !(e.combatant.mixStab ?? false) : true; // flip from last; combatant-less → stab
      if (e.combatant) e.combatant.mixStab = stab;
      motion = stab ? 'stab' : 'arc';
    } else {
      motion = pat === 'line' ? 'stab' : pat;
    }
    const stretch = motion === 'stretch';
    const foot = shape.limb === 'foot';
    let side: number;
    if (foot && e.combatant) {
      // alternate kicking feet so consecutive kicks visibly MIRROR (left → right → left …), like real kicks
      e.combatant.kickSide = -(e.combatant.kickSide ?? -1);
      side = e.combatant.kickSide;
    } else if (!stretch && e.equipment?.weapon) {
      side = shape.mirror ? -1 : 1; // the weapon hand — a mirrored combo step cuts back from the off side
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
      phases: { ...resolvePhases(e, d) }, // resolved ONCE here (like `motion`), COPIED so a stray mutation through the swing can never corrupt the def (defs are shared by every future cast)
      side,
      // committed aim + natural scatter — moving still makes it whiff. A GORE is a precise, committed ram (the
      // head IS the hitbox, so its aim must match the drawn head exactly) — no scatter, or the hitbox drifts off
      // the visible headbutt.
      angle: motion === 'gore' ? e.transform!.angle : this.scatter(e.transform!.angle),
      hitByVolume: [],
    };
    // SLASH-WAVE FX: if the ability has an 'arc' hit-volume that REACHES PAST the blade (the sword finisher's
    // energy crescent), draw a swoosh at that radius — so the extended-reach hitbox is VISIBLE, not an invisible
    // fan bigger than the drawn sword ("what you see is what hits"). FxSystem already renders the melee crescent.
    const wave = shape.hitVolumes?.find((v) => v.kind === 'arc');
    if (wave && wave.kind === 'arc') {
      const t = e.transform!;
      const life = (shape.swingTime ?? 0.18) * (e.melee.phases.active + e.melee.phases.recover); // spans active→recover
      events.emit('fx:swing', { type: 'melee', x: t.x, y: t.y, angle: e.melee.angle, len: wave.radius, arc: wave.halfAngle, life, max: life, enemy: !e.control });
    }
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
      this.strikes.hit(e, o, d, base, nx * kb, ny * kb, d.shake ?? 0, d.stun ?? 0);
      if (shape.single) break; // single-target shot stops at the nearest in the cone (hit or phased)
    }
  }
}
