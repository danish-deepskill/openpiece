import { describe, expect, it } from 'vitest';
import { FRIENDLY_FIRE_TAG, entityHostile, grudges, harmableBy } from '../src/combat/targeting';
import { TagSet } from '../src/combat/TagSet';
import { Rng } from '../src/core/Rng';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { Damage } from '../src/systems/Damage';
import { StrikeResolver } from '../src/systems/StrikeResolver';
import { Units } from '../src/defs/units';

describe('friendly-fire relations — grudge sits on top of the faction matrix', () => {
  it('a grudge makes two allies MUTUALLY hostile (symmetric)', () => {
    const w = new World();
    const a = w.create({ faction: { id: 'straw_hat' }, tags: new TagSet() });
    const b = w.create({ faction: { id: 'civilians' }, tags: new TagSet() });
    expect(entityHostile(a, b)).toBe(false); // allies per the matrix
    a.grudge = { ids: new Set([b.id]) }; // a turns on b …
    expect(grudges(a, b)).toBe(true);
    expect(entityHostile(a, b)).toBe(true);
    expect(entityHostile(b, a)).toBe(true); // … and it's war BOTH ways
  });

  it('harmableBy: allies are safe, but a grudge OR the friendly-fire tag opens them up', () => {
    const w = new World();
    const me = w.create({ faction: { id: 'straw_hat' }, tags: new TagSet() });
    const ally = w.create({ faction: { id: 'civilians' }, health: { hp: 10, maxHp: 10, dead: false, hitFlash: 0, iframes: 0 } });
    const foe = w.create({ faction: { id: 'bandits' }, health: { hp: 10, maxHp: 10, dead: false, hitFlash: 0, iframes: 0 } });

    expect(harmableBy(me)(ally)).toBe(false); // matrix protects an ally
    expect(harmableBy(me)(foe)).toBe(true); // a hostile is always fair game
    expect(harmableBy(me)(me)).toBe(false); // never self

    me.tags!.add(FRIENDLY_FIRE_TAG);
    expect(harmableBy(me)(ally)).toBe(true); // toggle ON → can start a betrayal
    me.tags!.remove(FRIENDLY_FIRE_TAG);
    expect(harmableBy(me)(ally)).toBe(false);

    ally.grudge = { ids: new Set([me.id]) }; // ally already turned on me
    expect(harmableBy(me)(ally)).toBe(true); // → I can retaliate WITHOUT the toggle
  });
});

describe('friendly-fire provocation — an ally beaten past tolerance turns permanently', () => {
  const strikes = new StrikeResolver(new Damage());

  it('forms a grudge only once HP crosses betrayHpFrac, and it is per-individual', () => {
    const w = new World();
    const sp = new Spawner(w, new Rng(1));
    const me = sp.spawnHero(0, 0); // straw_hat, controlled
    const villager = sp.spawnUnit('unit.villager', 40, 0); // civilians (ally), profile default betrayHpFrac 0.8

    villager.health!.hp = villager.health!.maxHp; // full → a 10% tap stays within tolerance
    strikes.hit(me, villager, villager.health!.maxHp * 0.1, 0, 0);
    expect(grudges(villager, me)).toBe(false);

    strikes.hit(me, villager, villager.health!.maxHp * 0.3, 0, 0); // now down past 80%
    expect(grudges(villager, me)).toBe(true);
    expect(entityHostile(me, villager)).toBe(true); // mutual now — I can fight back toggle-off
    expect(harmableBy(me)(villager)).toBe(true);
  });

  it('a real enemy hitting you is NOT a betrayal (allies only)', () => {
    const w = new World();
    const sp = new Spawner(w, new Rng(2));
    const villager = sp.spawnUnit('unit.villager', 0, 0);
    const bandit = sp.spawnUnit('unit.bandit', 40, 0); // hostile to civilians
    strikes.hit(bandit, villager, villager.health!.maxHp * 0.9, 0, 0); // hammer it
    expect(villager.grudge?.ids.has(bandit.id) ?? false).toBe(false); // no grudge entry — it was already war
  });

  it('a loyal unit (low betrayHpFrac override) absorbs far more before snapping', () => {
    Units.register({
      id: 'unit.testLoyalGuard',
      name: 'Loyal Guard',
      body: 'grunt',
      tier: 'E',
      faction: 'civilians', // ally of the player
      aiProfile: 'ai.guard',
      attackAbility: 'ability.punch',
      betrayHpFrac: 0.3, // tolerates being beaten to 30% before turning
    });
    const w = new World();
    const sp = new Spawner(w, new Rng(3));
    const me = sp.spawnHero(0, 0);
    const guard = sp.spawnUnit('unit.testLoyalGuard', 40, 0);

    guard.health!.hp = guard.health!.maxHp;
    strikes.hit(me, guard, guard.health!.maxHp * 0.5, 0, 0); // down to ~50% — a jumpy unit would have turned
    expect(grudges(guard, me)).toBe(false);
    strikes.hit(me, guard, guard.health!.maxHp * 0.3, 0, 0); // now ~20% ≤ 0.3
    expect(grudges(guard, me)).toBe(true);
  });
});
