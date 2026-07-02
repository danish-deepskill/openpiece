import { factions } from '../defs/factions';
import type { Entity } from '../ecs/components';

/** Can `attacker`'s strike land on `o`? One predicate for EVERY hit loop (melee contact, pistol cone,
 *  landing AoE) — excludes self, ships, the dead, and anyone canHarm forbids (allies; neutral wildlife is
 *  huntable). A new exclusion rule (corpse-targeting, invulnerable ships, riders) lands here ONCE. */
export function harmableBy(attacker: Entity): (o: Entity) => boolean {
  const mine = attacker.faction!.id;
  return (o) => o !== attacker && !o.ship && !o.health?.dead && !!o.faction && factions.canHarm(mine, o.faction.id);
}
