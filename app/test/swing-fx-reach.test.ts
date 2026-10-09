import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { abilityRange, abilityReach, strikeRange, strikeReach } from '../src/combat/swing';
import { events, type SwingFx } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

/** A swing VISUAL may claim only the STEEL's reach. The flurry crescent was drawn at the engagement reach, which adds a
 *  dash-cut's step — the arc appeared ~45px past the blades, a hitbox that was never there. */
describe('swing visuals are drawn at the steel, never at the engagement reach', () => {
  const toro = Abilities.get('ability.toro'); // a scissor WITH a step (launchAt) — its reach math is the general case
  const saiKuru = Abilities.get('ability.saiKuru'); // a FLURRY with a step: the crescent that lied
  const kamaitachi = Abilities.get('ability.kamaitachi'); // a flurry without one

  it('abilityRange = strikeRange + the step\'s travel; equal when the swing carries no step', () => {
    expect(abilityRange(toro, 30, 36)).toBe(Math.round(strikeRange(toro, 30, 36) + toro.selfImpulse! * toro.impulseDur!));
    expect(abilityRange(kamaitachi, 30, 36)).toBe(strikeRange(kamaitachi, 30, 36));
    expect(strikeRange(toro, 30, 36)).toBe(Math.round(30 * 0.3 + 36)); // the arm home + the blade
  });

  it('a stepping flurry\'s crescent is emitted at strikeReach, short of the engagement reach', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(3));
    const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1));
    const zoro = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    const seen: SwingFx[] = [];
    const off = events.on('fx:swing', (fx) => { if (fx.type === 'melee' && fx.cuts !== undefined) seen.push(fx); });
    expect(abilities.activate(zoro, 'ability.saiKuru')).toBe(true);
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.len).toBe(strikeReach(zoro, saiKuru));
    expect(seen[0]!.len).toBeLessThan(abilityReach(zoro, saiKuru)); // the brain's number stays longer — it engages from where the step lands
    expect(seen[0]!.cuts).toBe(4);
  });
});
