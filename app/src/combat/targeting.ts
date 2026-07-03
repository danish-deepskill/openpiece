import { factions } from '../defs/factions';
import type { Entity } from '../ecs/components';

/** Tag on the entity currently allowed to strike its own allies (the player's friendly-fire toggle). */
export const FRIENDLY_FIRE_TAG = 'mode.friendlyFire';

/** Has `a` personally turned hostile toward `b` (a permanent grudge from friendly fire past its tolerance)? */
export function grudges(a: Entity, b: Entity): boolean {
  return a.grudge?.ids.has(b.id) ?? false;
}

/** Entity-level hostility = the static faction matrix OR a personal grudge EITHER way. A grudge is mutual
 *  (once one side turns, it's war between the two specific entities), so AI targeting and the harm gate both
 *  read this and stay in sync — the provoker can retaliate the instant the victim snaps. */
export function entityHostile(a: Entity, b: Entity): boolean {
  if (!a.faction || !b.faction) return false;
  return factions.isHostile(a.faction.id, b.faction.id) || grudges(a, b) || grudges(b, a);
}

/** Can `attacker`'s strike land on `o`? One predicate for EVERY hit loop (melee contact, pistol cone,
 *  landing AoE) — excludes self, ships, and the dead. Normally forbids allies (canHarm), BUT a personal
 *  grudge (either way) makes the pair mutually harmable, and the friendly-fire tag lets the attacker hit
 *  anyone (the toggle that starts a betrayal). A new exclusion rule (riders, invuln ships) lands here ONCE. */
export function harmableBy(attacker: Entity): (o: Entity) => boolean {
  const mine = attacker.faction!.id;
  const friendlyFire = attacker.tags?.has(FRIENDLY_FIRE_TAG) ?? false;
  return (o) =>
    o !== attacker && !o.ship && !o.health?.dead && !!o.faction &&
    (friendlyFire || factions.canHarm(mine, o.faction.id) || grudges(o, attacker) || grudges(attacker, o));
}
