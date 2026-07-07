import { describe, expect, it } from 'vitest';
import { BREATH_DRAIN, DROWN_DAMAGE, DROWN_INTERVAL, MAX_BREATH, SWIM_STAM_DRAIN, Tile } from '../src/config/constants';
import { StatBlock } from '../src/combat/StatBlock';
import type { Entity } from '../src/ecs/components';
import { World } from '../src/ecs/World';
import { CombatantSystem } from '../src/systems/CombatantSystem';
import { Damage } from '../src/systems/Damage';
import { SwimSystem } from '../src/systems/SwimSystem';
import { TileGrid } from '../src/world/TileGrid';

/**
 * The two-resource water loop (docs/design/MOVEMENT_AIR.md): SURFACE swim drains STAMINA; run dry → SINK; while
 * SUBMERGED, BREATH drains (a distinct resource — the underwater clock); empty breath = DROWNING (health via the
 * one Damage path). On land, breath refills. Locks in the loop so the future underwater pillar builds on it.
 */

/** An all-DEEP-water grid so a 'swim' actor is genuinely in the deep (drain keys on actual depth, not just mode). */
function deepGrid(): TileGrid {
  const g = new TileGrid(10, 10);
  g.tiles = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => Tile.Water));
  return g;
}
function swimmer(world: World, mode: 'foot' | 'swim', submerged = false): Entity {
  return world.create({
    transform: { x: 5 * 32, y: 5 * 32, angle: 0, r: 8 }, // out in the (all-deep) water
    mover: { vx: 0, vy: 0, speed: 100, mass: 1, mode, dodgeT: 0, dvx: 0, dvy: 0, submerged },
    health: { hp: 100, maxHp: 100, dead: false, hitFlash: 0, iframes: 0 },
    combatant: { stam: 100, maxStam: 100, combo: 0, comboT: 0, posture: 0, maxPosture: 20 },
  });
}
const sys = (world: World) => new SwimSystem(world, new Damage());

describe('swim/breath/drown loop (SwimSystem)', () => {
  it('a FOOT actor (wading/on land) does not drain — only the swim mode does', () => {
    // resources drain by the SWIM mode, which is now TRUTHFUL (MovementSystem sets it only when actually over deep
    // water). So a foot actor — wading the shallows or on land — never drains; the "breath starts in the shallows"
    // bug is structurally impossible now (the mode can't be 'swim' unless you're genuinely in the deep).
    const world = new World();
    const e = swimmer(world, 'foot'); // NOT swimming
    sys(world).update(1);
    expect(e.combatant!.stam).toBe(100); // no drain on foot
    expect(e.combatant!.breath).toBe(MAX_BREATH);
  });

  it('SURFACE swimming drains stamina (not breath) — breath stays topped up', () => {
    const world = new World();
    const e = swimmer(world, 'swim');
    sys(world).update(1); // one second of surface swimming
    expect(e.combatant!.stam).toBeCloseTo(100 - SWIM_STAM_DRAIN, 1); // stamina spent
    expect(e.combatant!.breath).toBe(MAX_BREATH); // breathing at the surface — breath full
    expect(e.mover!.submerged).toBe(false);
  });

  it('running out of stamina while swimming makes you SINK (submerge)', () => {
    const world = new World();
    const e = swimmer(world, 'swim');
    e.combatant!.stam = 5; // almost gone
    sys(world).update(1); // drains past 0
    expect(e.combatant!.stam).toBe(0);
    expect(e.mover!.submerged).toBe(true); // sank under
  });

  it('SUBMERGED drains BREATH (the underwater clock), not stamina', () => {
    const world = new World();
    const e = swimmer(world, 'swim', true); // dived
    const stamBefore = e.combatant!.stam;
    sys(world).update(1);
    expect(e.combatant!.breath).toBeCloseTo(MAX_BREATH - BREATH_DRAIN, 1); // breath spent underwater
    expect(e.combatant!.stam).toBe(stamBefore); // stamina untouched while submerged
  });

  it('drowning is a DISCRETE tick of the FULL DROWN_DAMAGE — one hit per interval, def IGNORED (can\'t armor the sea)', () => {
    const world = new World();
    const e = swimmer(world, 'swim', true);
    e.attributes = new StatBlock({ def: 8 }); // armored — but drowning is TRUE damage, so def must NOT reduce it
    e.combatant!.stam = 0; // exhausted → stays under
    e.combatant!.breath = 0; // out of air
    const hp = e.health!.hp;
    const mv = sys(world);
    // partway into the interval: NO damage yet (the fix — no per-frame 1-by-1 slide)
    for (let i = 0; i < 30; i++) mv.update((DROWN_INTERVAL / 60)); // ~half the interval
    expect(e.health!.hp).toBe(hp); // still full — the tick hasn't fired
    // cross the interval → exactly ONE clean, FULL DROWN_DAMAGE hit (def 8 ignored → the whole 12, not 4)
    for (let i = 0; i < 40; i++) mv.update((DROWN_INTERVAL / 60));
    expect(hp - e.health!.hp).toBe(DROWN_DAMAGE); // the full chunk, unreduced by armor
  });

  it('back on LAND, breath refills and you are never submerged', () => {
    const world = new World();
    const e = swimmer(world, 'foot', true); // was submerged, now on foot (climbed out)
    e.combatant!.breath = 10;
    sys(world).update(1);
    expect(e.mover!.submerged).toBe(false); // cleared on land
    expect(e.combatant!.breath).toBeGreaterThan(10); // recovering
  });

  it('an EXHAUSTED sinker actually DROWNS — stamina stays frozen underwater (no perpetual surface↔sink cycle)', () => {
    // the bug: submerged used to let CombatantSystem regen stamina, so a sinker's stam climbed back > 0, met the
    // gasp condition, and surfaced just before drowning — bobbing forever, never dying. Run BOTH systems together
    // (the real tick) and confirm: submerged with stam 0 → stam STAYS 0 → can't gasp → breath empties → drowns.
    const world = new World();
    const g = deepGrid();
    const e = swimmer(world, 'swim', true); // submerged
    e.combatant!.stam = 0; // sank from exhaustion
    e.combatant!.breath = 5; // nearly out of air
    const swim = new SwimSystem(world, new Damage());
    const combat = new CombatantSystem(world);
    const hp0 = e.health!.hp;
    for (let i = 0; i < 30; i++) { swim.update(0.1); combat.update(0.1); } // 3s underwater
    expect(e.combatant!.stam).toBe(0); // FROZEN — never regenerated underwater (the fix)
    expect(e.mover!.submerged).toBe(true); // never gasped up (stam 0) — stayed under
    expect(e.health!.hp).toBeLessThan(hp0); // …and actually drowned (took damage)
  });
});
