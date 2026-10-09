import { describe, expect, it } from 'vitest';
import { spendStamina, stamCap } from '../src/combat/stamina';
import { VIGOR_FLOOR, VIGOR_RECOVER, WILL_REGEN } from '../src/config/constants';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { CombatantSystem } from '../src/systems/CombatantSystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

function rig(unit = 'unit.samurai') {
  const world = new World();
  const sp = new Spawner(world, new Rng(1));
  const e = sp.spawnUnit(unit, 0, 0);
  return { world, e, c: e.combatant!, combatants: new CombatantSystem(world), abilities: new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)) };
}

describe('VIGOR — the stamina bar\'s ceiling over the day', () => {
  it('spending is FREE for the day; the breath that comes BACK is what wears the ceiling — never below the floor', () => {
    const { c, combatants } = rig();
    expect(stamCap(c)).toBe(c.maxStam);
    spendStamina(c, c.maxStam); // one full bar burned…
    expect(c.vigor ?? 1).toBe(1); // …costs the day nothing yet
    c.regenT = 0;
    for (let i = 0; i < 60 * 10; i++) combatants.update(1 / 60); // refill it
    expect(c.vigor!).toBeLessThan(1); // now the day paid
    expect(c.vigor!).toBeGreaterThan(0.85); // ≈ −0.125 for the bar refilled (the cap sinks as it fills, so a little less)…
    expect(c.vigor!).toBeLessThan(0.95); // …plus a few seconds of recovery once the breath was back (ceiling ~90–94%)
    for (let k = 0; k < 40; k++) {
      spendStamina(c, c.maxStam);
      c.regenT = 0;
      for (let i = 0; i < 60 * 10; i++) combatants.update(1 / 60);
    }
    expect(c.vigor!).toBeLessThan(0.05); // a sinking cap refills fewer points each round, so it approaches the floor rather than slamming into it
    expect(stamCap(c)).toBeLessThan(c.maxStam * VIGOR_FLOOR + 3); // some bar always remains
  });

  it('regen refills only up to the (sinking) cap, and the cap climbs back slowly once the breath is back', () => {
    const { c, combatants } = rig();
    c.vigor = 0.5;
    spendStamina(c, c.maxStam);
    c.regenT = 0;
    for (let i = 0; i < 60 * 10; i++) combatants.update(1 / 60); // refill (the cap sinks a little under it)
    expect(c.stam).toBeLessThanOrEqual(stamCap(c) + 1e-6); // never past the ceiling
    expect(c.stam).toBeGreaterThan(stamCap(c) - 1); // but all the way up to it
    const vig0 = c.vigor!;
    for (let i = 0; i < 60 * 20; i++) combatants.update(1 / 60); // 20s of rest with the bar full
    // recovery raises the cap, the bar tops the sliver up, and that sliver costs its 15% — so rest nets ~85% of the
    // nominal rate (the reserve's own refill is breath too). ~3.5 minutes to full, not 3.
    expect(c.vigor!).toBeGreaterThan(vig0 + VIGOR_RECOVER * 20 * 0.8);
    expect(c.vigor!).toBeLessThanOrEqual(vig0 + VIGOR_RECOVER * 20 + 1e-6);
  });

  it('a spend mid-regen pulls the fill down under a lowered ceiling', () => {
    const { c, combatants } = rig();
    c.vigor = 0.2; // a tired body
    c.stam = c.maxStam; // (a stale full fill)
    c.regenT = 0;
    combatants.update(1 / 60);
    expect(c.stam).toBeLessThanOrEqual(stamCap(c) + 1e-6); // the fill follows the ceiling down (the cap crept up a hair in the same tick — rest)
    expect(c.stam).toBeLessThan(c.maxStam * 0.6);
  });
});

describe('WILL — the haki pool, seeded by spiritual', () => {
  it('the Ronin has a pool (spiritual 12 → 120); a thug has none at all', () => {
    const ronin = rig('unit.ronin').c;
    expect(ronin.maxWill).toBe(120);
    expect(ronin.will).toBe(120);
    const thug = rig('unit.thug').c;
    expect(thug.maxWill).toBeUndefined();
    expect(thug.will).toBeUndefined();
  });

  it('no will → no haki: the coating is unaffordable to a body without a pool, and to one that spent it', () => {
    const { e, abilities, c } = rig('unit.ronin');
    expect(abilities.ready(e, 'ability.armament')).toBe(true);
    c.will = 3; // under a second of the 6/s drain — not enough fuel to light
    expect(abilities.ready(e, 'ability.armament')).toBe(false);
    c.will = 6;
    expect(abilities.ready(e, 'ability.armament')).toBe(true);
    const thug = rig('unit.thug');
    thug.e.loadout!.granted.add('ability.armament'); // even granted, a will-less body can't light it
    expect(thug.abilities.ready(thug.e, 'ability.armament')).toBe(false);
  });

  it('will trickles back after its delay, slower than breath', () => {
    const { c, combatants } = rig('unit.ronin');
    c.will = 0;
    c.willRegenT = 2;
    for (let i = 0; i < 60; i++) combatants.update(1 / 60); // the delay
    expect(c.will).toBe(0);
    for (let i = 0; i < 60 * 2; i++) combatants.update(1 / 60);
    expect(c.will).toBeCloseTo(WILL_REGEN * 1, 0); // ~one second of trickle after the two-second delay (the tick that zeroes the delay doesn't yet refill)
  });
});
