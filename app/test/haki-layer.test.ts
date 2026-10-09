import { describe, expect, it } from 'vitest';
import { equip, unequip } from '../src/combat/equip';
import { Hakis } from '../src/defs/layers';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';

describe('the HAKI layer — the fourth equip kind, on the one equip path', () => {
  it('equipping haki.armament routes Armament into the C slot and grants it; unequip clears both', () => {
    const e = new Spawner(new World(), new Rng(1)).spawnHero(0, 0);
    expect(e.loadout!.utilities).toEqual([]);
    equip(e, 'haki', 'haki.armament');
    expect(e.equipment!.haki).toBe('haki.armament');
    expect(e.loadout!.utilities).toEqual(['ability.armament']);
    expect(e.loadout!.granted.has('ability.armament')).toBe(true);
    expect(e.tags!.has('haki.armament')).toBe(true); // the layer's own tag (the KNOWN haki, not the active coating)
    unequip(e, 'haki', 'haki.armament');
    expect(e.equipment!.haki).toBeUndefined();
    expect(e.loadout!.utilities).toEqual([]);
    expect(e.loadout!.granted.has('ability.armament')).toBe(false);
    expect(e.tags!.has('haki.armament')).toBe(false);
  });

  it('the buff KEYS are haki > fruit > style in order — nothing is shadowed: C the coating, X the shout', () => {
    const e = new Spawner(new World(), new Rng(1)).spawnHero(0, 0);
    equip(e, 'style', 'style.kenjutsu');
    expect(e.loadout!.utilities).toEqual(['ability.kiai']);
    equip(e, 'haki', 'haki.armament');
    expect(e.loadout!.utilities).toEqual(['ability.armament', 'ability.kiai']); // haki is the layer that counters the others — it takes C; the shout moves to X
    expect(e.loadout!.granted.has('ability.kiai')).toBe(true);
    unequip(e, 'haki', 'haki.armament');
    expect(e.loadout!.utilities).toEqual(['ability.kiai']); // the style's comes back to C
  });

  it('every haki row resolves and names a real technique', () => {
    for (const h of Hakis.all()) expect(h.utility === undefined || h.utility.startsWith('ability.')).toBe(true);
    expect(Hakis.get('haki.armament').utility).toBe('ability.armament');
  });
});
