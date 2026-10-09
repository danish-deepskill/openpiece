import { Abilities, SHOT_POINT_R, type AbilityDef, type HazardSpec } from '../combat/Ability';
import { Effects, TAG_SLOWED, TAG_STUNNED } from '../combat/Effect';
import { effectiveTier } from '../combat/dominance';
import { fxThemeOf } from '../combat/fxTheme';
import { phaseAt, resolvePhases, swingDuration } from '../combat/phases';
import { abilityReach, flurryCuts, strikeReach } from '../combat/swing';
import { beginFall } from './MovementSystem';
import { spendStamina, spendWill, stamCostOf } from '../combat/stamina';
import { harmableBy } from '../combat/targeting';
import { SPREAD_SHOT_KICK } from '../config/constants';
import { COMBO_RECOVERY_STAT, SHOT_RANGE_STAT, SHOT_SCALE_STAT } from '../combat/stats';
import { events } from '../core/EventBus';
import { angleDiff, dist, norm } from '../core/math';
import type { Rng } from '../core/Rng';
import type { ContentId } from '../core/Registry';
import type { Entity, Loadout, MeleeSwing } from '../ecs/components';
import type { World } from '../ecs/World';
import type { EffectSystem } from './EffectSystem';
import type { StrikeResolver } from './StrikeResolver';
import { SpatialQuery } from '../world/SpatialQuery';

/** Per-strike aim error (rad), centred toward 0 — natural imprecision so combat isn't a perfect lock.
 *  (Could become a per-unit `accuracy` stat later: skilled fighters tighten this.) */
const AIM_SPREAD = 0.18;

/** Set an ability's cooldown REMAINING and record its DURATION (cdMax) in one place, so the two never drift —
 *  the HUD fill reads (1 − cd/cdMax) and MUST see the actual duration set (atkSpeed-scaled, or a combo root
 *  locked for the finisher's cd), not the ability's base def.cooldown. */
function setCooldown(lo: Loadout, id: ContentId, seconds: number): void {
  lo.cd.set(id, seconds);
  lo.cdMax.set(id, seconds);
}

/**
 * Resolves abilities for any actor with a `loadout` — the single attack path (the old CombatSystem folded
 * in here). Damage scales off the user's Attributes, so all four combat layers feed one resolution.
 */
/** Seconds a swing-wave crescent lingers past its hit window — a fade, not a second hitbox. */
const WAVE_TAIL = 0.12;
/** A HEAVY crescent's fading tail (s) — the great cut's sweep lingers longer than a flick's. */
const HEAVY_TAIL = 0.28;

/** Seconds of a held state's drain a body must hold in the pool to switch it on (combat/Ability `toggle` + EffectDef drains). */
const HELD_MIN_FUEL_S = 1;

export class AbilitySystem {
  // query DEFAULTED so standalone tests stand unchanged; the scene passes its SHARED instance (audit M1:
  // every neighbor enumeration through the one chokepoint — the future grid swap must share one index)
  constructor(
    private readonly world: World,
    private readonly effects: EffectSystem,
    private readonly strikes: StrikeResolver,
    private readonly rng: Rng, // the seeded `combat` stream: scatter / motion picks (determinism)
    private readonly query: SpatialQuery = new SpatialQuery(world),
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
    // DASH CHAINS (a multi-step flash-step — Sandan): the next step fires the instant the previous impulse ends,
    // re-aimed at the live direction (impulse() reads movement, else facing). A swing started mid-chain, a stun or
    // death ends it — a dash string is movement, never a vehicle for a drive-by.
    for (const e of this.world.with('mover', 'transform')) {
      const m = e.mover;
      const chain = m?.dashChain;
      if (!m || !chain) continue;
      if (e.melee || e.health?.dead || e.tags?.has(TAG_STUNNED)) {
        delete m.dashChain;
        continue;
      }
      if (m.dodgeT > 0) continue;
      if (chain.wait > 0) {
        chain.wait -= dt; // the plant between steps — the player's held direction lands here (InputSystem writes intent only while not dashing)
        continue;
      }
      const d = Abilities.get(chain.ability);
      this.impulse(e, d.selfImpulse!, d.impulseDur ?? 0.16); // boot-validated: dashes needs selfImpulse
      chain.left--;
      chain.wait = d.dashGap ?? 0;
      if (chain.left <= 0) delete m.dashChain;
    }
    // deferred launches (Gomu Rocket) + AoE slams (Gomu Ono): fire the body-impulse / area slam at its cue.
    for (const e of this.world.with('melee', 'mover', 'transform')) {
      const m = e.melee;
      if (!m) continue; // the snapshot can go stale: landAoe → a PARRIED slam deletes this entity's melee mid-loop
      const d = Abilities.get(m.ability);
      if (d.selfImpulse && d.launchAt) {
        // LAUNCH CUES: a swing that carries its own impulses (the Rocket's one, a dash-cut's one) fires each cue ONCE as
        // progress crosses it, along the swing's locked aim. After the LAST cue the swing is HELD until that impulse
        // ends, then `landed` — slam the AoE if one is authored. `landed` MUST be set either way or MeleeSystem keeps
        // the swing alive forever waiting for a slam that never comes (the actor stuck rooted mid-swing).
        const fired = m.launches ?? 0;
        if (fired < d.launchAt.length && m.t / m.dur >= d.launchAt[fired]!) { // index-bounded by the length check
          if (fired === 0) {
            m.launchX = e.transform!.x; // the step's origin — a 'trail' volume cuts from here to wherever he stops
            m.launchY = e.transform!.y;
          }
          m.launches = fired + 1;
          this.launch(e, m.angle, d.selfImpulse, d.impulseDur ?? 0.16);
        } else if (fired === d.launchAt.length && !m.landed && e.mover!.dodgeT <= 0) {
          m.landed = true;
          m.landedAt = m.t;
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
      // a HAZARD-leaving swing: the tick its ACTIVE phase closes (the cut has landed), leave the zone where the blades were —
      // a blade's reach ahead along the committed aim, from where he stands NOW (Flow may have carried him). Once per swing.
      if (d.hazard && !m.hazardLeft && m.t / m.dur >= m.phases.windup + m.phases.active) {
        m.hazardLeft = true;
        this.leaveHazard(e, m, d, d.hazard);
      }
      if (m.motion === 'shot' && !m.shotFired) {
        // SHOT: the ball leaves the barrel when the swing crosses into ACTIVE (after the windup) — so a big windup
        // (Buckshot) is a real "winding up the scatter" TELL you can dodge, not an instant spawn. Fired once.
        if (m.t / m.dur >= m.phases.windup) {
          m.shotFired = true;
          this.spawnShot(e, m.angle, m.ability, d);
        }
      }
      // VOLLEYS (a channel that looses shots mid-swing — Kamaitachi's wind slashes): fire each cue ONCE as the
      // progress crosses its `at`, FORWARD along the swing's aim with a seeded ±spread so the volley fans.
      // (Firing along the blade's live angle was tried: a plan's cues land at the same phase of same-direction
      // sweeps, so every slash left on one identical line.) Independent of the branches above.
      if (d.volleys) {
        const p = m.t / m.dur;
        let n = m.volleysFired ?? 0;
        while (n < d.volleys.length && p >= d.volleys[n].at) {
          const v = d.volleys[n]; // in range: the while condition bounds n
          const heading = m.angle + (this.rng.next() - this.rng.next()) * (v.spread ?? 0); // biased to straight ahead
          this.spawnShot(e, heading, v.ability, Abilities.get(v.ability));
          n++;
        }
        m.volleysFired = n;
      }
    }
  }

  /** Which of a cycle's effects the body holds now (−1 = none). */
  cycleIndex(e: Entity, cycle: readonly ContentId[]): number {
    const active = e.effects?.active;
    if (!active) return -1;
    return cycle.findIndex((id) => active.some((a) => a.id === id));
  }

  /** Put a cycling stance INTO a given mode (`target` an effect of its cycle, or undefined = none) — presses the cycle
   *  as many times as it takes, bounded by its length. The brain's way to choose a pace without counting presses. */
  cycleTo(e: Entity, id: ContentId, target: ContentId | undefined): boolean {
    const d = Abilities.get(id);
    if (!d.cycle) return false;
    const want = target === undefined ? -1 : d.cycle.indexOf(target);
    if (target !== undefined && want < 0) return false;
    for (let i = 0; i <= d.cycle.length && this.cycleIndex(e, d.cycle) !== want; i++) if (!this.activate(e, id)) return false;
    return this.cycleIndex(e, d.cycle) === want;
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
    // candidates via the SPATIAL CHOKEPOINT (audit M1) — pad covers the widest body; exact test below
    this.query.forEachWithin(t.x, t.y, radius + 40, (o) => {
      if (!o.health || !o.faction || !canHit(o)) return;
      const ot = o.transform!; // forEachWithin only visits transformed entities
      const dx = ot.x - t.x;
      const dy = ot.y - t.y;
      const gap = Math.hypot(dx, dy); // NOT `dist` — that would shadow the core/math import used below
      if (gap > radius + ot.r) return;
      const inv = gap > 0.01 ? 1 / gap : 0; // knock each target radially outward from the impact
      this.strikes.hit(e, o, d, base, dx * inv * kb, dy * inv * kb, 0, d.stun ?? 0); // no per-target shake; the slam shook once above
    });
  }

  ready(e: Entity, id: string): boolean {
    const lo = e.loadout;
    if (!lo || !lo.granted.has(id)) return false;
    if ((lo.cd.get(id) ?? 0) > 0) return false;
    const d = Abilities.get(id);
    if (d.costStam && (e.combatant?.stam ?? 0) < stamCostOf(e, d.costStam) && !e.tags?.has('state.godMode')) return false; // can't use what you can't afford, at THIS body's price (god mode: free)
    if (d.costWill && (e.combatant?.will ?? 0) < d.costWill && !e.tags?.has('state.godMode')) return false; // no will (or none at all) → no haki
    // a HELD state needs FUEL to light: at least one second of its drain in the pool — so a dry body can't flash a coating
    // on for a tick (the drain would end it at once, but the tag would have flickered), and "has haki" = has will
    if (d.grantEffect && !e.tags?.has('state.godMode')) {
      const held = Effects.get(d.grantEffect);
      if (held.drainWillPerSec !== undefined && (e.combatant?.will ?? 0) < held.drainWillPerSec * HELD_MIN_FUEL_S) return false;
      if (held.drainStamPerSec !== undefined && (e.combatant?.stam ?? 0) < held.drainStamPerSec * HELD_MIN_FUEL_S) return false;
    }
    if (d.blockTags && e.tags && d.blockTags.some((t) => e.tags!.has(t))) return false;
    if (d.requireTags && (!e.tags || !d.requireTags.every((t) => e.tags!.has(t)))) return false;
    return true;
  }

  activate(e: Entity, id: string): boolean {
    if (e.tags?.has(TAG_STUNNED) || e.tags?.has(TAG_SLOWED)) return false; // frozen OR staggered — can't act (CC = effect tags)
    const lo = e.loadout;
    // combo chain: a repeat press of the same slot inside the window fires the NEXT step instead of
    // restarting — gates (cooldown/cost/granted) are checked against the step that actually fires
    let actual = id;
    if (lo?.chain && lo.chain.root === id) {
      if (lo.granted.has(lo.chain.next)) actual = lo.chain.next;
      else delete lo.chain; // stale chain (weapon swapped mid-combo) — fall back to the pressed ability
    }
    // a TOGGLE whose effect is already up: this press switches it OFF — free (the on-press paid; the ignition's cooldown
    // must never lock the switch ON), through the effect system's end path, so modifiers/tags leave exactly as a
    // timer's expiry would. Checked before every gate below; nothing else runs for the off-press.
    {
      const td = Abilities.get(actual);
      if (td.toggle && td.grantEffect && lo?.granted.has(actual) && this.effects.end(e, td.grantEffect)) return true;
    }
    // a STANCE CYCLE press: end the current mode, apply the next (none after the last). Free and instant — before every
    // gate below except the grant (a stance is a thing you hold, not a cast).
    {
      const cd = Abilities.get(actual);
      if (cd.cycle && lo?.granted.has(actual)) {
        const cur = this.cycleIndex(e, cd.cycle);
        if (cur >= 0) this.effects.end(e, cd.cycle[cur]!); // index-bounded by cycleIndex
        const next = cur + 1;
        if (next < cd.cycle.length) this.effects.apply(e, cd.cycle[next]!, actual);
        return true;
      }
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
    if (!god && d.costStam && e.combatant) spendStamina(e.combatant, stamCostOf(e, d.costStam), e); // spend at the body's price + regen pause, one rule
    if (!god && d.costWill && e.combatant) spendWill(e.combatant, d.costWill); // the haki pool, its own one rule
    // attack speed is a tier stat: effective recovery = base cooldown / atkSpeed (default 1); the SWING itself
    // is scaled by the same stat in startSwing/fireShot (combat/phases.swingDuration)
    const atkSpeed = this.atkSpeedOf(e);
    setCooldown(lo!, actual, god ? 0 : d.cooldown / atkSpeed); // `!` safe: ready() above returns false when loadout is absent
    // chain bookkeeping: arm the next step — or, on a chain's FINAL step, lock the ROOT for this step's
    // cooldown too (the post-combo recovery; without it the chain would restart the instant it finishes)
    if (lo) {
      if (d.comboNext) lo.chain = { root: id, next: d.comboNext, until: d.comboWindow ?? 0.9 };
      else {
        // lock the chain ROOT for the FINISHER's cd (not slash1's own), scaled by the wielder's COMBO RECOVERY
        // stat (Kiai halves the post-combo pause; the steps' own cooldowns are untouched) — cdMax records THIS
        // duration so the HUD fill is correct
        const recovery = Math.max(0.1, e.attributes?.get(COMBO_RECOVERY_STAT) ?? 1);
        if (actual !== id) setCooldown(lo, id, god ? 0 : (d.cooldown / atkSpeed) * recovery);
        if (lo.chain?.root === id) delete lo.chain;
      }
    }
    if (d.grantEffect) this.effects.apply(e, d.grantEffect, actual);
    if (d.shape) {
      if (d.shape.swing === 'pistol') this.resolveHit(e, d); // ranged: instant hitscan cone (Gomu rubber arm)
      else if (d.shape.swing === 'shot') this.fireShot(e, actual, d); // ranged: spawn a travelling projectile
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
      if ((d.dashes ?? 1) > 1 && e.mover) e.mover.dashChain = { ability: actual, left: d.dashes! - 1, wait: d.dashGap ?? 0 }; // the rest of the string fires in update() as each step ends (+ its plant)
    }
    // (A melee ability's recoilPush is now HIT-GATED — the leap-back fires from MeleeSystem only when the kick
    //  CONNECTS, not at cast, so a whiff leaves the kicker planted. The 'shot' path still recoils on fire.)
    // JUMP: enter the AIR layer for `jump` seconds (MovementSystem lands it). Refreshes airT if already aloft —
    // the seed for Geppo (a re-launch mid-air just resets the timer). airDur holds the total for the draw's arc.
    if (d.jump && e.mover) {
      e.mover.layer = 'air';
      e.mover.airT = d.jump;
      e.mover.airDur = d.jump;
    }
    // GEPPO: TOGGLE the hover. On → go airborne + start hovering (MovementSystem keeps it up, spends per-kick
    // stamina, auto-lands when broke). Off → clear hovering (MovementSystem lands it next tick, applying the
    // landing stun like a jump). The toggle itself is free; the cost is the per-kick drain while aloft.
    if (d.geppo && e.mover) {
      if (e.mover.hovering) {
        beginFall(e.mover); // toggle OFF — DESCEND (a smooth fall arc), not an instant snap; land + stun at the bottom
      } else {
        e.mover.hovering = true;
        e.mover.layer = 'air';
        e.mover.hoverT = 0;
        e.mover.hoverElapsed = 0; // start the launch: presentation rises from the ground over the first kick
        e.mover.fallT = 0; // cancel any in-progress fall (re-toggling Geppo mid-descent kicks back up)
        // DOUBLE-KICK launch: a cloud puff RIGHT HERE (the kick off the GROUND to get airborne) — the first air
        // kick's puff follows ~a beat later (MovementSystem's per-kick cadence). Reads as "kick off floor → kick
        // off air", the Geppo launch, distinct from a single-puff plain jump.
        const t = e.transform;
        if (t) events.emit('fx:ring', { x: t.x, y: t.y, radius: t.r * 1.2, color: 0xffffff, life: 0.28 });
      }
    }
    return true;
  }

  /** A small centred random aim error so no strike is a perfect lock (biased toward 0; rarely wide). */
  private scatter(angle: number): number {
    return angle + (this.rng.next() - this.rng.next()) * AIM_SPREAD;
  }

  /** The wielder's attack speed (a tier stat, modifiable), floored so a broken stat can't divide by zero. */
  private atkSpeedOf(e: Entity): number {
    return Math.max(0.1, e.attributes?.get('atkSpeed') ?? 1);
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
    const phases = { ...resolvePhases(e, d) }; // resolved ONCE here (like `motion`), COPIED so a stray mutation through the swing can never corrupt the def (defs are shared by every future cast)
    e.melee = {
      ability: id,
      t: 0,
      dur: swingDuration(shape.swingTime ?? 0.18, this.atkSpeedOf(e), phases), // attack speed shortens the SWING, tell-floored (constants.TELL_FLOOR)
      motion,
      phases,
      side,
      // committed aim + natural scatter — moving still makes it whiff. A GORE is a precise, committed ram (the
      // head IS the hitbox, so its aim must match the drawn head exactly) — no scatter, or the hitbox drifts off
      // the visible headbutt.
      angle: motion === 'gore' ? e.transform!.angle : this.scatter(e.transform!.angle),
      hitByVolume: [],
    };
    // SWING-WAVE FX — ONE rule for every 'arc' hit volume (a finisher's energy crescent, a flurry's large sweeps,
    // the wind): a swoosh at the volume's OUTER radius, cued to the volume's OWN window (windowless ⇒ the active
    // phase, MeleeSystem's read-time default) plus a fading tail — so an extended-reach hitbox is visible exactly
    // when it is live ("what you see is what hits"; the old cast-time wave played through the charge-hold). A
    // flurry adds a trail that whips once per cut. Visuals FOLLOW the swinger and die with the swing (FxSystem).
    const sw = e.melee;
    const t = e.transform!;
    const heavy = motion === 'twinCleave'; // the great cut's crescents are HEAVY (a thick glowing sweep) — the thin swoosh read as a flick
    for (const v of shape.hitVolumes ?? []) {
      if (v.kind !== 'arc') continue;
      const a0 = v.active ? v.active[0] : sw.phases.windup;
      const a1 = v.active ? v.active[1] : sw.phases.windup + sw.phases.active;
      const sweep = sw.dur * (a1 - a0); // the crescent crosses its arc in the volume's own window…
      const life = sweep + (heavy ? HEAVY_TAIL : WAVE_TAIL); // …then fades in place
      events.emit('fx:swing', { type: 'melee', x: t.x, y: t.y, angle: sw.angle, len: v.radius, arc: v.halfAngle, life, max: life, sweep, enemy: !e.control, delay: sw.dur * a0, follow: e.id, ability: id, theme: fxThemeOf(e), heavy });
    }
    const reach = strikeReach(e, d); // the STEEL's radius — never the engagement reach (which adds a dash-cut's step and painted the crescent where no blade was)
    const activeLife = sw.dur * sw.phases.active;
    const cue = sw.dur * sw.phases.windup;
    const theme = fxThemeOf(e);
    if (motion === 'flurry') {
      events.emit('fx:swing', { type: 'melee', x: t.x, y: t.y, angle: sw.angle, len: reach, arc: shape.arc, life: activeLife, max: activeLife, enemy: !e.control, cuts: flurryCuts(shape), delay: cue, follow: e.id, ability: id, theme });
    } else if (motion === 'scissorIn' || motion === 'scissorOut') {
      // TWO crescents, one per blade, each sweeping its own half of the spread — meeting in the middle (in) or parting from
      // it (out). The lead blade sweeps +spread→front for 'in' (the default direction); its mirror is the off blade.
      const half = Math.max(0.05, shape.arc) / 2;
      const inward = motion === 'scissorIn';
      const life = activeLife + WAVE_TAIL; // the sweep plus a fading tail — a SNAP of a cut still leaves a visible flash
      for (const side of [1, -1] as const) {
        const centre = sw.angle + side * sw.side * half; // each blade's crescent sits on ITS side of the aim
        events.emit('fx:swing', { type: 'melee', x: t.x, y: t.y, angle: centre, len: reach, arc: half, life, max: life, sweep: activeLife, enemy: !e.control, delay: cue, follow: e.id, ability: id, theme, mirror: (side * sw.side > 0) !== inward });
      }
    } else if (motion === 'twinCleave') {
      // a heavy crescent riding the BLADES too (the force arc above sits out at its own radius): the sweep is anchored to
      // the steel, and the two together read as one wide blow rolling outward from the swords
      const life = activeLife + HEAVY_TAIL;
      events.emit('fx:swing', { type: 'melee', x: t.x, y: t.y, angle: sw.angle, len: reach, arc: Math.max(0.6, shape.arc), life, max: life, sweep: activeLife, enemy: !e.control, delay: cue, follow: e.id, ability: id, theme, heavy: true });
    } else if (motion === 'twinThrust') {
      events.emit('fx:swing', { type: 'thrust', x: t.x, y: t.y, angle: sw.angle, len: reach, life: activeLife, max: activeLife, enemy: !e.control, delay: cue, follow: e.id, ability: id, theme });
    }

    // (ELECTRIC swing visual is now drawn ON the foot itself — draw/actorDraws.drawFoot reads shape.swingFx —
    //  so the charge is welded to the limb through the whole swing, not a one-shot spark guessed near it.)
  }

  /** Leave a ground hazard (AbilityDef.hazard) where a swing's cut landed: its own entity, the owner's theme stamped now (a
   *  coating dropped later keeps the mark black — it was cut black), the strokes turned to world angles off the committed aim. */
  private leaveHazard(e: Entity, m: MeleeSwing, d: AbilityDef, spec: HazardSpec): void {
    const t = e.transform!; // the melee loop iterates with('melee', 'mover', 'transform')
    const ahead = strikeReach(e, d) * spec.ahead;
    this.world.create({
      transform: { x: t.x + Math.cos(m.angle) * ahead, y: t.y + Math.sin(m.angle) * ahead, angle: m.angle, r: 0 },
      hazard: {
        ability: d.id,
        owner: e.id,
        strokes: spec.strokes.map((st) => ({ angle: m.angle + st.angle, len: st.len })),
        width: spec.width,
        life: spec.life,
        maxLife: spec.life,
        tickEvery: spec.tickEvery,
        nextTick: spec.tickEvery,
        maxHits: spec.maxHits,
        damageMul: spec.damageMul,
        stun: spec.stun ?? 0,
        hits: {},
        theme: fxThemeOf(e),
      },
    });
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

  /** BEGIN a TRAVELLING shot: set up the recoil-pose swing at activation, but DON'T fire the balls yet — the
   *  projectiles leave the barrel at the WINDUP→ACTIVE cue (spawnShot, driven by update()), so a big windup
   *  (Buckshot) is a real "winding up" tell you can dodge, not an instant spawn. The aim is COMMITTED here (the
   *  swing.angle = current facing) so a moving/turning shooter can't re-aim mid-wind. A VISUAL-ONLY 'shot' swing
   *  (noHit → MeleeSystem skips it) drives the pose. */
  private fireShot(e: Entity, id: string, d: AbilityDef): void {
    const t = e.transform!;
    const shape = d.shape!;
    const phases = { ...resolvePhases(e, d) };
    e.melee = {
      ability: id,
      t: 0,
      dur: swingDuration(shape.swingTime ?? 0.4, this.atkSpeedOf(e), phases), // a quick hand fires its pose faster too
      motion: 'shot',
      phases,
      side: 1,
      angle: t.angle, // COMMIT the aim now (fired at the active cue along this heading)
      hitByVolume: [],
    };
  }

  /** FIRE the shot — spawn the projectile(s) + muzzle flash + recoil pushback. Called at the windup→active cue
   *  (update()), NOT at activation, so the windup telegraphs. Aim = the swing's committed angle + the LIVE spread
   *  scatter (settled/bloomed by CombatantSystem). Buckshot (pellets>1) fans a cone; each pellet rolls electric. */
  private spawnShot(e: Entity, heading: number, abilityId: ContentId, d: AbilityDef): void {
    const t = e.transform!;
    const shape = d.shape!;
    // scatter within the shooter's LIVE aim cone (combatant.spread — narrow when aimed+still, wide when
    // hip-firing/moving; CombatantSystem eases it). No combatant (a turret) ⇒ the fixed AIM_SPREAD.
    const half = e.combatant?.spread ?? AIM_SPREAD;
    const aim = heading + (this.rng.next() - this.rng.next()) * half; // committed heading + a scatter (biased to 0)
    // RECOIL BLOOM: THIS shot fired from the current cone; now kick it WIDER (the settle re-tightens it as you
    // hold aim) — so paced shots stay tight but a rapid string sprays. The "don't spray" skill (#19).
    if (e.combatant) e.combatant.spread = (e.combatant.spread ?? half) + SPREAD_SHOT_KICK;
    const speed = shape.shotSpeed!; // boot-validated present + > 0 for a 'shot' shape
    const life = speed > 0 ? (shape.range! * (e.attributes?.get(SHOT_RANGE_STAT) ?? 1)) / speed : 0; // range (boot-validated > 0 for a shot) × the shooter's range stat / speed = seconds aloft (the ball fizzles at range)
    const shotScale = e.attributes?.get(SHOT_SCALE_STAT) ?? 1; // the shooter's shot scale at fire (a pump's larger slashes)
    const muzzle = shape.muzzle ?? t.r; // born ahead of the shooter's body so it doesn't self-collide
    // CLOSE-RANGE PASS-THROUGH baked at FIRE time (shared by every pellet — same barrel, same jam risk).
    const passChance = this.closePass(e, shape);
    // BUCKSHOT: a 'shot' with pellets > 1 fires a CONE of balls in ONE trigger pull — each pellet gets its own
    // scatter (across shotSpreadArc) + its OWN electric roll (a lucky pellet can zap). pellets 1 (default) = the
    // single musket ball. All pellets share the recoil pose + pushback below (one shot, many balls).
    const pellets = Math.max(1, shape.pellets ?? 1);
    const spreadArc = shape.shotSpreadArc ?? 0; // extra per-pellet fan HALF-angle (rad); 0 ⇒ dead-on the aim
    for (let i = 0; i < pellets; i++) {
      // fan the pellets across [-spreadArc, +spreadArc]: evenly for a tight pattern, plus a small jitter so it
      // isn't a rigid comb. A single ball (pellets 1, spreadArc 0) keeps the exact old dead-on-aim behavior.
      const spread = pellets > 1 ? ((i / (pellets - 1)) * 2 - 1) * spreadArc + (this.rng.next() - this.rng.next()) * spreadArc * 0.3 : 0;
      const pa = aim + spread;
      const mx = t.x + Math.cos(pa) * muzzle;
      const my = t.y + Math.sin(pa) * muzzle;
      // CHARGED-ROUND roll PER PELLET (at fire time): a proc'd ball carries its effect payload (shocked/…) +
      // damage mult — ProjectileSystem applies it on contact; the renderer themes the ball by the effect color.
      const pe = shape.procEffect;
      const proc = pe && pe.chance > 0 && this.rng.chance(pe.chance) ? { effect: pe.effect, dur: pe.dur, damageMult: pe.damageMult ?? 1 } : undefined;
      this.world.create({
        transform: { x: mx, y: my, angle: pa, r: (shape.shotRadius ?? SHOT_POINT_R) * shotScale }, // the HIT radius (ProjectileSystem sweeps target.r + this), scaled with the drawn size (shotSize × scale in the renderer)
        projectile: { owner: e.id, ability: abilityId, vx: Math.cos(pa) * speed, vy: Math.sin(pa) * speed, life, hit: [], passChance, proc, theme: fxThemeOf(e), kind: shape.shotProc === 'slash' ? 'slash' : 'ball', rung: effectiveTier(e), scale: shotScale }, // the shooter's state at FIRE time rides the shot (a coated crescent stays black — and keeps its rung and size — if the coating or pump drops mid-flight)
      });
    }
    const mx = t.x + Math.cos(aim) * muzzle; // muzzle flash at the barrel (the aim line, not a pellet)
    const my = t.y + Math.sin(aim) * muzzle;
    events.emit('fx:burst', { x: mx, y: my, color: 0xffe08a, n: 6, speed: 140 }); // muzzle flash
    // RECOIL PUSHBACK: shove the shooter BACKWARD (opposite the aim), mass-scaled — a musket kicks a light body
    // back a step. Fired WITH the ball (the active cue), so the kick lands as the shot leaves.
    if (d.recoilPush) this.applyRecoil(e, aim, d.recoilPush);
  }

  /** Shove `e` BACKWARD (opposite `facing`), mass-scaled — the fired shot's recoil kick. (A MELEE move's on-hit
   *  shove-off is a different mechanic: MovementSystem.leapBack, a jump-style hop gated on the hit LANDING.)
   *  Rides the dodge-impulse channel (dvx/dvy + dodgeT) so it does NOT delete the swing the way a `selfImpulse`
   *  dodge does. A heavier body barely budges. `dur` = the impulse window (s); a gun's recoil is a brief twitch. */
  private applyRecoil(e: Entity, facing: number, push: number, dur = 0.12): void {
    const m = e.mover;
    if (!m) return;
    const mass = Math.max(0.2, m.mass); // guard a zero/absurd mass; heavier = less shove
    const p = push / mass;
    m.dvx = -Math.cos(facing) * p;
    m.dvy = -Math.sin(facing) * p;
    m.dodgeT = Math.max(m.dodgeT, dur);
  }

  /** CLOSE-RANGE PASS-THROUGH chance (0..1) baked when the shot is fired. A long musket shoved point-blank
   *  can't cleanly bear on a rushing body, so a shot fired up close has a chance to phase THROUGH (no hit) —
   *  measured to the NEAREST harmable body (whoever the barrel's jammed against), not the eventual impact.
   *  STEEP quadratic fade: `peak · (1 − d/range)²`, zero beyond `closePassRange`. This is proximity fumble at
   *  fire time — NOT a conscious deflect (that's a future parry-vs-projectile mechanic on the guard). */
  private closePass(e: Entity, shape: NonNullable<AbilityDef['shape']>): number {
    const peak = shape.closePassChance ?? 0;
    const range = shape.closePassRange ?? 0;
    if (peak <= 0 || range <= 0) return 0; // opted out (no knob) ⇒ always connects
    const t = e.transform!; // shooter has a transform (proven by fireShot's caller)
    const canHit = harmableBy(e);
    let nearest = Infinity;
    // only surface gaps INSIDE closePassRange matter — the chokepoint cut (audit M1) pads for the widest body
    this.query.forEachWithin(t.x, t.y, range + 40, (o) => {
      if (o.id === e.id || !o.health || !o.faction || !canHit(o)) return;
      const gap = dist(t.x, t.y, o.transform!.x, o.transform!.y) - o.transform!.r; // surface gap, not center
      if (gap < nearest) nearest = gap;
    });
    if (nearest >= range) return 0; // no one point-blank ⇒ a clean shot
    const k = 1 - Math.max(0, nearest) / range; // 1 at contact → 0 at the range edge
    return peak * k * k; // STEEP: squared, so only truly point-blank shots risk fumbling
  }

  /** Instant ranged shot (pistol): a cone test from the muzzle; each chosen target resolved via StrikeResolver. */
  private resolveHit(e: Entity, d: AbilityDef): void {
    const t = e.transform!;
    const shape = d.shape!;
    const canHit = harmableBy(e);
    const base = this.strikes.baseDamage(e, d);
    const range = abilityReach(e, d);
    const aim = this.scatter(t.angle); // the shot scatters slightly off true aim
    events.emit('fx:swing', { type: 'pistol', x: t.x, y: t.y, angle: aim, len: range, life: 0.16, max: 0.16, arc: shape.arc });

    // candidates via the SPATIAL CHOKEPOINT (audit M1): the old shape filtered + SORTED the whole world
    // per shot — now only bodies the cone could reach are gathered, then range-sorted (nearest-first for
    // shape.single). Pad covers the widest body; the exact cone/range tests below still decide.
    const targets = this.query
      .within(t.x, t.y, range + 40, (o) => !!o.health && !!o.faction && canHit(o))
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
