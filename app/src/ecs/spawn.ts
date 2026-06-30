import Phaser from 'phaser';
import { enemyBrain } from '../ai/brains';
import { tierStats } from '../combat/PowerTier';
import { StatBlock } from '../combat/Stat';
import { TagSet } from '../combat/Tags';
import { giveWeapon, refreshLoadout } from '../combat/equip';
import { rand } from '../core/math';
import { Bodies } from '../defs/actors';
import { AIProfiles } from '../defs/aiProfiles';
import { ShipHulls } from '../defs/ships';
import type { FactionId } from '../defs/factions';
import { Fruits, Weapons } from '../defs/layers';
import { Units } from '../defs/units';
import { draws, drawPickup } from '../draw/actorDraws';
import { drawShip } from '../draw/shipDraws';
import type { Entity } from './components';
import type { World } from './World';

/** Stamina pool size (current value lives on the Combatant; same for everyone for now). */
const MAX_STAM = 100;

/**
 * Factory for entities. Every actor is assembled from the same component set; what makes the
 * hero "the player" is only the `control` tag (+ avatar). Possess any other and it plays the same.
 */
export class Spawner {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {}

  private gfx(x: number, y: number): Phaser.GameObjects.Graphics {
    return this.scene.add.graphics().setPosition(x, y);
  }

  spawnHero(x: number, y: number): Entity {
    const u = Units.get('unit.hero');
    const b = Bodies[u.body];
    const ts = tierStats(u.tier); // hp/atk/def/atkSpeed derived from the hero's power tier
    const hero = this.world.create({
      transform: { x, y, angle: 0, r: b.r },
      mover: { vx: 0, vy: 0, speed: b.speed, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
      health: { hp: ts.hp, maxhp: ts.hp, dead: false, hitFlash: 0, iframes: 0 },
      faction: { id: u.faction },
      avatar: { hasFruit: false },
      combatant: { stam: MAX_STAM, maxStam: MAX_STAM, combo: 0, comboT: 0 },
      control: {},
      attributes: new StatBlock({ atk: ts.atk, def: ts.def, maxHp: ts.hp, maxStam: MAX_STAM, reach: b.reach, atkSpeed: ts.atkSpeed }),
      tags: new TagSet(),
      loadout: { granted: new Set(['ability.punch', 'ability.dodge']), cd: new Map(), primary: 'ability.punch', dash: 'ability.dodge', slots: [] },
      effects: { active: [] },
      equipment: { potentials: [] },
      render: { gfx: this.gfx(x, y), draw: draws[b.draw], baseColor: b.baseColor, hatColor: b.hatColor, bob: 0 },
    });
    // The hero starts UNARMED — bare fists. Weapons, a Devil Fruit, a fighting style, and Combat Potentials
    // are earned, then compose onto this base via equip(). (Haki is A-tier+; nobody has it yet.)
    refreshLoadout(hero);
    return hero;
  }

  /** Spawn any unit from its UnitDef (body archetype + tier-derived stats). Same stack as the hero. */
  spawnEnemy(unitId: string, x: number, y: number, squad?: { id: number; name: string }, weapon?: string): Entity {
    const u = Units.get(unitId);
    const b = Bodies[u.body];
    const ts = tierStats(u.tier);
    const hp = Math.round(ts.hp * (u.hpMult ?? 1)); // elites bloat HP beyond their power tier
    const profile = AIProfiles.get(u.aiProfile);
    const e = this.world.create({
      transform: { x, y, angle: 0, r: b.r },
      mover: { vx: 0, vy: 0, speed: b.speed, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
      health: { hp, maxhp: hp, dead: false, hitFlash: 0, iframes: 0 },
      faction: { id: u.faction },
      combatant: { stam: MAX_STAM, maxStam: MAX_STAM, combo: 0, comboT: 0 },
      attributes: new StatBlock({ atk: ts.atk, def: ts.def, maxHp: hp, maxStam: MAX_STAM, reach: b.reach, atkSpeed: ts.atkSpeed }),
      tags: new TagSet(),
      loadout: { granted: new Set([u.attackAbility]), cd: new Map(), primary: u.attackAbility, dash: '', slots: [] },
      ai: { brain: enemyBrain, bb: { state: 'wander', home: { x, y }, wanderT: rand(0, 2), wdx: 0, wdy: 0, boss: !!u.boss, profile, lastSeenX: x, lastSeenY: y, lostT: 0 } },
      loot: { gold: u.gold ?? 0 },
      render: { gfx: this.gfx(x, y), draw: draws[b.draw], baseColor: b.baseColor, hatColor: b.hatColor, bob: 0, showHpBar: true, hpColor: 0xd4483b, label: u.boss ? u.name.toUpperCase() : undefined },
    });
    if (squad) e.squad = squad;
    if (weapon) giveWeapon(e, weapon); // rarely armed (e.g. a cutlass)
    return e;
  }

  spawnPickup(kind: 'weapon' | 'fruit', defId: string, x: number, y: number): Entity {
    const label = kind === 'weapon' ? Weapons.get(defId).name : Fruits.get(defId).name;
    return this.world.create({
      transform: { x, y, angle: 0, r: 10 },
      pickup: { kind, defId, label },
      render: { gfx: this.gfx(x, y), draw: drawPickup, baseColor: 0xffffff, bob: 0 },
    });
  }

  spawnShip(hullId: string, x: number, y: number, faction: FactionId, anchored = true): Entity {
    const d = ShipHulls.get(hullId);
    return this.world.create({
      transform: { x, y, angle: 0, r: d.r },
      health: { hp: d.hp, maxhp: d.hp, dead: false, hitFlash: 0, iframes: 0 },
      faction: { id: faction },
      ship: { hull: hullId, mode: 'exploration', anchored, speed: 0 },
      render: { gfx: this.gfx(x, y), draw: drawShip, baseColor: d.color, bob: 0, rotateToAngle: true, depthBias: -4 },
    });
  }
}
