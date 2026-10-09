import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { applyEffect, TAG_PUMPED } from '../src/combat/Effect';
import { Rng } from '../src/core/Rng';
import { Accessories } from '../src/defs/accessories';
import { factions } from '../src/defs/factions';
import { Units, unitProblem } from '../src/defs/units';
import { accessoryDraws } from '../src/draw/accessoryDraws';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { EffectSystem } from '../src/systems/EffectSystem';
import type { StrikeResolver } from '../src/systems/StrikeResolver';

function field(seed = 4): { world: World; sp: Spawner; abilities: AbilitySystem } {
  const world = new World();
  const sp = new Spawner(world, new Rng(seed));
  const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(1)); // contact never resolves here
  return { world, sp, abilities };
}

describe('unit.zoroAdvanced — the A-tier challenger: two swords, one weapon', () => {
  it('spawns at A as a challenger with the pair, the nitōryū style and the Armament haki — his OWN kit on every key', () => {
    const { sp } = field();
    const e = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    expect(e.identity!.tier).toBe('A');
    expect(e.faction!.id).toBe('challengers');
    expect(e.equipment!.weapon).toBe('weapon.nitoryu');
    const lo = e.loadout!;
    expect(lo.primary).toBe('ability.toro'); // LMB: the Nigiri chain
    expect(lo.heavy).toBe('ability.saiKuru'); // RMB: the rhino → the hawk wave
    expect(lo.dash).toBe('ability.ushiBari'); // Q: the lunge
    expect(lo.utilities).toEqual(['ability.armament', 'ability.niGorilla']); // C the coating, X the pump
    expect(lo.slots).toEqual(['ability.nigoriZake', 'ability.nanajuniPound', 'ability.rashomon']); // 1 · 2 · 3
    for (const id of ['ability.hirameki', 'ability.samon', 'ability.takaNami']) expect(lo.granted.has(id)).toBe(true); // the chains' later steps come with their roots
    expect(e.combatant!.maxWill).toBe(150); // spiritual 15 × 10
    expect(e.attributes!.get('moveSpeedMul')).toBeCloseTo(1.25, 9); // Fleet: quick on the feet (a trait, not a tier stat)
    expect(e.ai!.bb.boss).toBe(true);
    expect(unitProblem(Units.get('unit.zoroAdvanced'))).toBeNull();
  });

  it('wears the concept art: green spikes (hair), the crimson sash (chest, body-follow), three earrings (face) — draws resolve', () => {
    const { sp } = field();
    const e = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    expect(e.accessories!.slots.hair).toBe('accessory.hairZoro');
    expect(e.accessories!.slots.chest).toBe('accessory.sashZoro');
    expect(e.accessories!.slots.face).toBe('accessory.earringsZoro');
    for (const id of ['accessory.hairZoro', 'accessory.sashZoro', 'accessory.earringsZoro']) {
      const d = Accessories.get(id);
      expect(d.palette).toBeDefined(); // a palette-driven draw, not a per-color draw key
      if (d.visual.kind === 'procedural') expect(accessoryDraws[d.visual.draw]).toBeDefined(); // the boot sweep's headless twin
      else throw new Error(`${id} should be procedural`);
    }
    expect(Accessories.get('accessory.sashZoro').follows).toBe('body'); // a sash turns with the torso, not the cursor
  });

});

describe('challengers ⚔ ronin — mutual, and nobody else', () => {
  it('a challenger hunts the ronin on sight and the ronin accepts on sight; both leave everyone else alone', () => {
    expect(factions.isHostile('challengers', 'ronin')).toBe(true);
    expect(factions.isHostile('ronin', 'challengers')).toBe(true); // one-way left the master standing until the first cut landed
    for (const f of ['straw_hat', 'marine', 'pirates', 'civilians', 'wildlife'] as const) {
      expect(factions.isHostile('challengers', f)).toBe(false); // he leaves the watcher alone…
      expect(factions.isHostile(f, 'challengers')).toBe(false); // …and nobody but the bandits (hostile to all by default) hunts him
    }
  });
});

describe('the gates: a technique is a decision, not a cooldown', () => {
  it('Nigori Zake needs the Ni Gorilla pump; Rashōmon needs the coating', () => {
    const { sp, abilities } = field();
    const e = sp.spawnUnit('unit.zoroAdvanced', 0, 0);
    expect(abilities.activate(e, 'ability.nigoriZake')).toBe(false);
    applyEffect(e, 'effect.niGorilla', 'test');
    expect(e.tags!.has(TAG_PUMPED)).toBe(true);
    expect(abilities.activate(e, 'ability.nigoriZake')).toBe(true);
    delete e.melee; // the swing is over
    expect(abilities.activate(e, 'ability.rashomon')).toBe(false); // no coating
    applyEffect(e, 'effect.armament', 'test');
    expect(abilities.activate(e, 'ability.rashomon')).toBe(true);
    expect(Abilities.get('ability.rashomon').costWill).toBeGreaterThan(0); // will for the edge
  });
});
