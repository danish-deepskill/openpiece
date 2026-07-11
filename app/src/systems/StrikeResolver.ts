import { Abilities, type AbilityDef } from '../combat/Ability';
import { applyEffect } from '../combat/Effect';
import type { Rng } from '../core/Rng';
import { damagePosture, PARRY_POSTURE, PARRY_STUN, resolveGuard, WEIGHT_POSTURE } from '../combat/guard';
import { interruptChance, kitWeapon, phaseAt } from '../combat/phases';
import { COMBO_CAP, COMBO_WINDOW, FX_COLOR, GUARD_KNOCKBACK_CARRY, GUARD_KNOCKBACK_MULT, PARRY_KNOCKBACK_MULT } from '../config/constants';
import { events } from '../core/EventBus';
import { factions } from '../defs/factions';
import { entityHostile, grudges } from '../combat/targeting';
import type { Entity } from '../ecs/components';
import type { Damage } from './Damage';

/**
 * The single place a confirmed hit becomes damage. Both the melee engine (contact, MeleeSystem) and ranged
 * abilities (cone, AbilitySystem) funnel through here, so damage scaling, combo, Logia intangibility, the
 * GUARD (block/parry), knockback and impact FX live in ONE spot — add an on-hit rule (crit, lifesteal,
 * status) once and every attack respects it. Geometry/targeting stays in the callers; this only resolves an
 * already-chosen hit.
 */
export class StrikeResolver {
  constructor(
    private readonly damage: Damage,
    private readonly rng: Rng, // the seeded `combat` stream — the interrupt-chance roll (below) must be deterministic
  ) {}

  /** Ability `d`'s base damage for attacker `e`: attribute-scaled (damageStat) + flat bonus + combo (≤ COMBO_CAP). */
  baseDamage(e: Entity, d: AbilityDef): number {
    const combo = Math.min(e.combatant?.combo ?? 0, COMBO_CAP);
    return (d.damageStat ? e.attributes?.get(d.damageStat) ?? 0 : 0) + (d.damageFlat ?? 0) + combo;
  }

  /**
   * Land one hit from `e` on `o` (via ability `d`) with a forward (kx,ky) knockback. Resolution order:
   * Logia intangibility → the target's GUARD (parry negates + punishes; block reroutes HP → posture) →
   * damage + combo + hitstun + AI alert. Returns false when nothing landed (phased, parried, blocked, or
   * refused by i-frames/god-mode inside Damage.apply) — a refused hit is the DEFENDER's small win, so it
   * must not feed the attacker's combo or launch latches (leap-backs, procs, slam flags).
   */
  hit(e: Entity, o: Entity, d: AbilityDef, base: number, kx: number, ky: number, shake = 0, stun = 0): boolean {
    const ot = o.transform!;
    if (o.tags?.has('state.logia.intangible') && !e.tags?.has('haki.armament.active')) {
      events.emit('fx:burst', { x: ot.x, y: ot.y, color: FX_COLOR.phase, n: 6, speed: 110 });
      return false;
    }
    // AIRBORNE DODGE (docs/design/MOVEMENT_AIR.md): a jump FULLY (100%) evades a grounded attacker by default —
    // a deterministic, readable dodge ("I jumped → I dodged"). The EXCEPTION is an ANTI-AIR attack: `airCatch`
    // (0..1) is ITS chance to catch the jumper anyway (1 = always catches, 0.5 = a gamble). So any randomness
    // lives on the specific counter-move, NOT on baseline melee. Rolled on the seeded `combat` stream (replays
    // agree). Only a ground→air mismatch applies: two grounded or two airborne fighters trade normally.
    if (o.mover?.layer === 'air' && e.mover?.layer !== 'air') {
      const caught = (d.airCatch ?? 0) > 0 && this.rng.next() < d.airCatch!; // an anti-air move rolls its own catch
      if (!caught) {
        events.emit('fx:burst', { x: ot.x, y: ot.y, color: FX_COLOR.phase, n: 6, speed: 110 });
        return false; // whiffed under the jumper (a normal ground attack; or the anti-air missed its roll)
      }
    }
    // GUARD — posture damage is the ability's own `posture` if authored (a fruit power like Gomu, or the bull's
    // gore, has no weapon class, so the weight table would under-rate it as a bare 'light' hit), else it scales
    // by the attacker's combat WEIGHT (kit rule: a punch thrown while a sword is sheathed rattles a guard like a
    // fist, not like a heavy). Weaponless → 'light' (the fallback since 'unarmed' folded into it).
    const posture = d.posture ?? WEIGHT_POSTURE[kitWeapon(e, d)?.weaponClass ?? 'light'];
    const outcome = resolveGuard(e, o, posture);
    if (outcome === 'parried') {
      // the deflection backfires onto the attacker: posture spike (parry pressure can BREAK an aggressor),
      // a stagger, and the swing itself is gone — the defender's punish opening
      damagePosture(e, PARRY_POSTURE);
      applyEffect(e, 'effect.staggered', 'parry', PARRY_STUN); // the parry punish is a stagger (already doubled in guard.ts)
      delete e.melee;
      this.guardKnockback(e, o, d, kx, ky, PARRY_KNOCKBACK_MULT); // a heavy blow jolts even a parry back a touch (< a block)
      events.emit('fx:burst', { x: ot.x, y: ot.y, color: FX_COLOR.parry, n: 12, speed: 240 });
      events.emit('fx:shake', { amount: 2 });
      this.alertAI(o, e, false);
      return false;
    }
    if (outcome === 'blocked' || outcome === 'guardBreak') {
      // resolveGuard already banked the posture damage; the blocker braces — but a HEAVY blow's mass shoves them
      // back a little (chip damage is still a deliberate non-feature). Block knockback > parry (bracing vs deflecting).
      this.guardKnockback(e, o, d, kx, ky, 1);
      events.emit('fx:burst', { x: ot.x, y: ot.y, color: FX_COLOR.spark, n: 4, speed: 120 });
      if (outcome === 'guardBreak') events.emit('fx:shake', { amount: 5 }); // the break is the loud moment
      this.alertAI(o, e, false);
      return false;
    }
    // WALL-SLAM proc (the marine Buttstroke): roll `chance` to REPLACE the knockback with a LONG shove and arm the
    // target's slamStun — MovementSystem fires the electrified pin IF that shove slams them into a wall (else they
    // just fly far). Rescale the incoming kx/ky (already d.knockback-scaled) to the wallSlam magnitude, keeping dir.
    const om = o.mover;
    const slam = d.wallSlam && om && this.rng.chance(d.wallSlam.chance) ? d.wallSlam : undefined;
    if (slam) {
      const mag = Math.hypot(kx, ky) || 1;
      const scale = slam.knockback / mag;
      kx *= scale;
      ky *= scale;
    }
    const landed = this.damage.apply(o, base, kx, ky, !!o.control);
    // Arm the slam watch ONLY on a LANDED hit: an i-framed target takes no shove, so flags armed anyway would
    // ride the victim's OWN dodge impulse into the next wall — dodge-rolling through the Buttstroke must never
    // award its CC (the haunted-flag class the wallSlam boot validator warns about).
    if (slam && landed && om) {
      om.slamStun = slam.stun; // MovementSystem: FREEZE if this shove hits a wall…
      om.slamSlow = slam.slow; // …else the lighter SLOW when it ends free
    }
    // impact spark — tinted by the ability (hitFx) so an ELECTRIC kick pops cyan, a plain blow the default spark.
    events.emit('fx:burst', { x: ot.x, y: ot.y, color: d.hitFx ?? FX_COLOR.spark, n: 6, speed: 200 });
    if (shake > 0) events.emit('fx:shake', { amount: shake }); // shake is opt-in per ability (powerful moves only)
    if (landed && e.combatant) { // an i-framed hit landed NOTHING — no combo feed (same rule as parry/block)
      e.combatant.combo++;
      e.combatant.comboT = COMBO_WINDOW;
    }
    // HITSTUN — the interrupt is WINDUP-ONLY (commitment): a swing can be stopped only BEFORE it launches (its
    // windup, the read/react window). Once it's ACTIVE the blade is committed — hitting the attacker no longer
    // cancels it, so you TRADE (you both connect, and a heavier weapon out-damages the trade). This kills the
    // bare-hand cheese: spamming a fast attack into a committed heavy swing means you eat the sword too, instead
    // of deleting an already-travelling blade. A target NOT mid-swing takes normal stun (a jab still staggers you).
    if (landed && stun > 0 && o.combatant) {
      const swing = o.melee; // are they mid-swing, and if so what phase?
      const phase = swing ? phaseAt(swing.phases, swing.dur > 0 ? swing.t / swing.dur : 1) : undefined;
      if (!swing) {
        applyEffect(o, 'effect.staggered', 'hit', stun); // not swinging → a jab still STAGGERS (slowed-class, not a freeze)
      } else if (phase === 'windup') {
        // WINDUP → interruptible, but PROBABILISTICALLY by weight (Model D): a lighter hit only sometimes clips
        // the swing-arm and cancels a heavier windup. Roll on the seeded `combat` stream (determinism).
        const atk = kitWeapon(e, d)?.weaponClass ?? 'light';
        const def = kitWeapon(o, Abilities.get(swing.ability))?.weaponClass ?? 'light';
        if (this.rng.chance(interruptChance(atk, def))) {
          applyEffect(o, 'effect.staggered', 'interrupt', stun); // the interrupt STAGGERS + cancels the windup
          delete o.melee; // the windup is cancelled — the read/interrupt lands
        }
        // roll failed → the heavier swing shrugs off the clip and plays out (you traded)
      }
      // active/recover → COMMITTED: no cancel, no stun — the swing plays out and trades
    }
    this.alertAI(o, e, landed);
    return landed; // the honest outcome — consumers (Shock Kick leap-back, charged-round procs) gate on a real connect
  }

  /**
   * Shove a GUARDING defender (`o`) back when their block/parry eats a heavy blow — a heavy weapon has mass, so
   * even a stopped hit jolts the guard. `frac` scales it (1 on a block; a smaller PARRY_KNOCKBACK_MULT on a parry
   * — a clean deflection barely moves you). Magnitude = the ability's own `guardKnockback` if authored (per-weapon
   * — a greatsword shoves harder than a katana), else a fraction of the attack's normal `knockback` but ONLY for
   * a HEAVY-class weapon (light/medium bracing holds firm). Direction reuses the attack's (kx,ky).
   */
  private guardKnockback(e: Entity, o: Entity, d: AbilityDef, kx: number, ky: number, frac: number): void {
    const m = o.mover;
    if (!m) return; // immovable defender (a docked ship) — no shove
    const authored = d.guardKnockback;
    const isHeavy = (kitWeapon(e, d)?.weaponClass ?? 'light') === 'heavy';
    const mag = authored ?? (isHeavy ? (d.knockback ?? 0) * GUARD_KNOCKBACK_MULT : 0);
    if (mag <= 0) return;
    const len = Math.hypot(kx, ky) || 1; // normalize the attack's knockback vector to a pure direction
    const push = (mag * frac) / len;
    m.dvx = kx * push;
    m.dvy = ky * push;
    m.dodgeT = Math.max(m.dodgeT, GUARD_KNOCKBACK_CARRY); // carries LONGER than a normal hit → a visibly bigger slide
  }

  /** Getting hit — landed, blocked, or parried — ALERTS an AI victim to where the blow came from (a
   *  blind-side ambush buys only the first hit). Grudges form only on LANDED damage: a whiffed, i-framed,
   *  or blocked swing isn't a betrayal. */
  private alertAI(victim: Entity, attacker: Entity, landed: boolean): void {
    if (!victim.ai || !attacker.transform) return;
    const bb = victim.ai.bb;
    bb.quarryId = attacker.id; // pursue the attacker once it rounds toward them (id at rest — brains resolve it)
    bb.perceivedX = bb.lastSeenX = attacker.transform.x;
    bb.perceivedY = bb.lastSeenY = attacker.transform.y;
    bb.lostT = 0;
    bb.alertT = bb.profile.alertDur; // its own awareness trait (default lives in aiProfiles BASE, never here)
    if (landed) {
      this.formGrudge(attacker, victim); // friendly fire past tolerance → a permanent grudge
      this.provokeTerritorial(attacker, victim); // a struck NEUTRAL fighter (a bull) turns on whoever hit it
    }
  }

  /**
   * Friendly fire → betrayal. If `attacker` was an ALLY of the just-hit `victim` (a real enemy's blow isn't a
   * betrayal) and the hit left the victim at/below its `betrayHpFrac`, the victim forms a PERMANENT personal
   * grudge — from now the pair is mutually hostile (combat/targeting.entityHostile), so the victim fights back
   * and the attacker can keep hitting it with the friendly-fire toggle OFF. Per-individual: the victim's
   * faction is untouched, so its allies stay friendly.
   */
  private formGrudge(attacker: Entity, victim: Entity): void {
    const bb = victim.ai!.bb;
    const h = victim.health;
    if (bb.betrayHpFrac === undefined || !h || !attacker.faction || !victim.faction) return;
    if (!factions.isAlly(attacker.faction.id, victim.faction.id)) return; // only an ally can betray
    if (grudges(victim, attacker)) return; // already turned
    const frac = h.maxHp > 0 ? h.hp / h.maxHp : 0;
    if (frac > bb.betrayHpFrac) return; // still within tolerance
    (victim.grudge ??= { ids: new Set<number>() }).ids.add(attacker.id);
    events.emit('fx:burst', { x: victim.transform!.x, y: victim.transform!.y, color: FX_COLOR.spark, n: 10, speed: 150 });
    if (attacker.control) events.emit('notify', { msg: `${victim.identity?.name ?? 'An ally'} turns on you!` });
  }

  /**
   * TERRITORIAL retaliation (the bull): a NEUTRAL creature that FIGHTS (non-passive AI) turns hostile to
   * whoever strikes it — a grudge, so its AI acquires + charges its attacker (nearestHostile reads grudges).
   * This is the "provoke the bull" rule: unlike friendly-fire betrayal (formGrudge, ally-only), it fires for a
   * NON-ally, NON-hostile attacker — the neutral-animal case. Skipped for passive prey (they FLEE, not fight)
   * and when the pair is already hostile (a real enemy hitting it needs no new grudge). Symmetric mutual grudge
   * so the attacker can keep hitting it and it fights back (entityHostile reads either direction).
   */
  private provokeTerritorial(attacker: Entity, victim: Entity): void {
    const bb = victim.ai!.bb;
    if (bb.profile.passive || !attacker.faction || !victim.faction) return; // prey flee; need factions to judge
    if (factions.isAlly(attacker.faction.id, victim.faction.id)) return; // ally case is formGrudge's betrayal path
    if (entityHostile(attacker, victim)) return; // already at war (a real enemy) — no new grudge needed
    (victim.grudge ??= { ids: new Set<number>() }).ids.add(attacker.id); // it now hunts its attacker (the charge)
  }
}
