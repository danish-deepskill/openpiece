import type { AbilityDef } from '../combat/Ability';
import { COMBO_CAP, COMBO_WINDOW, FX_COLOR } from '../config/constants';
import { events } from '../core/EventBus';
import { factions } from '../defs/factions';
import { grudges } from '../combat/targeting';
import type { Entity } from '../ecs/components';
import type { Damage } from './Damage';

/**
 * The single place a confirmed hit becomes damage. Both the melee engine (contact, MeleeSystem) and ranged
 * abilities (cone, AbilitySystem) funnel through here, so damage scaling, combo, Logia intangibility,
 * knockback and impact FX live in ONE spot — add an on-hit rule (crit, lifesteal, status) once and every
 * attack respects it. Geometry/targeting stays in the callers; this only resolves an already-chosen hit.
 */
export class StrikeResolver {
  constructor(private readonly damage: Damage) {}

  /** Ability `d`'s base damage for attacker `e`: attribute-scaled (damageStat) + flat bonus + combo (≤ COMBO_CAP). */
  baseDamage(e: Entity, d: AbilityDef): number {
    const combo = Math.min(e.combatant?.combo ?? 0, COMBO_CAP);
    return (d.damageStat ? e.attributes?.get(d.damageStat) ?? 0 : 0) + (d.damageFlat ?? 0) + combo;
  }

  /**
   * Land one hit from `e` on `o` with a forward (kx,ky) knockback. Honors Logia intangibility (phases unless
   * the attacker has Armament Haki), deals damage, sparks impact FX, and advances the attacker's combo.
   * Returns false if it phased through.
   */
  hit(e: Entity, o: Entity, base: number, kx: number, ky: number, shake = 0, stun = 0): boolean {
    const ot = o.transform!;
    if (o.tags?.has('state.logia.intangible') && !e.tags?.has('haki.armament.active')) {
      events.emit('fx:burst', { x: ot.x, y: ot.y, color: FX_COLOR.phase, n: 6, speed: 110 });
      return false;
    }
    const landed = this.damage.apply(o, base, kx, ky, !!o.control);
    events.emit('fx:burst', { x: ot.x, y: ot.y, color: FX_COLOR.spark, n: 6, speed: 200 });
    if (shake > 0) events.emit('fx:shake', { amount: shake }); // shake is opt-in per ability (powerful moves only)
    if (e.combatant) {
      e.combatant.combo++;
      e.combatant.comboT = COMBO_WINDOW;
    }
    // hitstun: a blow that LANDS (not phased/i-framed) staggers the target — cancel its swing + brief stun
    if (landed && stun > 0 && o.combatant) {
      o.combatant.stunT = Math.max(o.combatant.stunT ?? 0, stun);
      delete o.melee;
    }
    // getting hit ALERTS an AI target to where the blow came from — a blind-side ambush buys only the first hit
    if (o.ai && e.transform) {
      const bb = o.ai.bb;
      bb.quarryId = e.id; // pursue the attacker once it rounds toward them (id at rest — brains resolve it)
      bb.perceivedX = bb.lastSeenX = e.transform.x;
      bb.perceivedY = bb.lastSeenY = e.transform.y;
      bb.lostT = 0;
      bb.alertT = bb.profile.alertDur; // its own awareness trait (default lives in aiProfiles BASE, never here)
      if (landed) this.formGrudge(e, o); // friendly fire past tolerance → a permanent grudge (a whiffed/i-framed swing isn't a betrayal)
    }
    return true;
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
}
