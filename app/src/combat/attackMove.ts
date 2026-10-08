import type { Entity } from '../ecs/components';
import { Abilities } from './Ability';
import { ATTACK_MOVE_STAT } from '../defs/traits';

/**
 * Move-speed penalty WHILE A SWING IS IN FLIGHT — the ONE rule the player's input and every AI brain call, so
 * "can I move while attacking" is identical for whoever holds the weapon (the Moat). A unit is mid-swing iff
 * `e.melee` is set (AbilitySystem sets it, MeleeSystem clears it at swing end).
 *
 * The kept fraction is the `attackMoveMult` stat: unset ⇒ 0 ⇒ ROOTED (plant your feet to commit — the base
 * case for fodder). A mobility trait (defs/traits: Footwork 0.45, Flow 1.0) overrides it up, so trained/expert
 * fighters shuffle or glide while swinging. Not mid-swing ⇒ speed is returned unchanged.
 */
export function attackMoveSpeed(e: Entity, speed: number): number {
  if (!e.melee) return speed; // not swinging — full speed
  if (Abilities.get(e.melee.ability).channel) return 0; // a CHANNEL plants the feet whatever the trait says (the counterplay is to walk out of it)
  const mult = e.attributes?.get(ATTACK_MOVE_STAT) ?? 0; // unset → 0 → rooted
  return speed * mult;
}
