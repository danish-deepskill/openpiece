import { actorBrain } from '../ai/brains';
import { MAX_STAM } from '../config/constants';
import { deriveAttributeStats, tierAttributes } from '../combat/attributes';
import { tierIndex, tierStats } from '../combat/PowerTier';
import { StatBlock } from '../combat/StatBlock';
import { TagSet } from '../combat/TagSet';
import { wearAccessory } from '../combat/apparel';
import { giveWeapon, refreshLoadout } from '../combat/equip';
import type { Rng } from '../core/Rng';
import { Bodies } from '../defs/bodies';
import { AIProfiles } from '../defs/aiProfiles';
import { ShipHulls } from '../defs/ships';
import type { FactionId } from '../defs/factions';
import { Fruits, Weapons } from '../defs/layers';
import { DASH_MIN_TIER, SPRINT_MIN_TIER, Units } from '../defs/units';
import type { Combatant, Entity } from './components';
import type { World } from './World';

/** The shared per-fight resource block — one literal, no drift. Spawns pass the endurance-derived
 *  `maxStam` attribute; the MAX_STAM default covers attribute-less targets (possessing a prop/ship). */
export function defaultCombatant(maxStam: number = MAX_STAM): Combatant {
  return { stam: maxStam, maxStam, combo: 0, comboT: 0 };
}

/**
 * Factory for entities — fully SIM-SIDE (no Phaser): render components are plain data; RenderSystem creates
 * the Graphics when it first sees them, so a headless server spawns units with this exact class. Every actor
 * is assembled from the same component set; what makes the hero "the player" is only the `control` tag.
 */
export class Spawner {
  constructor(
    private readonly world: World,
    private readonly rng: Rng, // the seeded `worldgen` stream — spawn-time rolls are part of world creation
  ) {}

  /** The hero is a REGULAR unit ('unit.hero') + the control/avatar tags — the Moat, literally: possess any
   *  other body and this one keeps living on its AI brain. Only the HUD-plate/no-overhead-bar bits differ. */
  spawnHero(x: number, y: number): Entity {
    const hero = this.spawnUnit('unit.hero', x, y);
    hero.identity!.name = 'You';
    hero.render!.showHpBar = false; // the HUD plate is the player's readout — no overhead bar on yourself
    hero.avatar = {};
    hero.control = {};
    hero.equipment = { potentials: [] };
    // The hero starts UNARMED — bare fists. Weapons, a Devil Fruit, a fighting style, and Combat Potentials
    // are earned, then compose onto this base via equip(). (Haki is A-tier+; nobody has it yet.)
    refreshLoadout(hero);
    return hero;
  }

  /**
   * Spawn ANY unit from its UnitDef — enemy, ally, or townsperson — on the SAME component stack as the hero
   * (the Moat). "Friend vs foe" is purely the unit's faction (data), never the spawn code; an NPC is just a
   * unit whose def carries `dialogue`. Tier-derived stats, AI brain, hp/stamina bars, nameplate — all uniform.
   */
  spawnUnit(unitId: string, x: number, y: number, squad?: { id: number; name: string }, weapon?: string, factionOverride?: FactionId): Entity {
    const u = Units.get(unitId);
    const faction = factionOverride ?? u.faction; // faction is data — any unit can be spawned under any banner (allies, defectors, tests)
    const b = Bodies[u.body];
    const seedTier = u.statTier ?? u.tier; // stats from statTier (else rank tier)
    const ts = tierStats(seedTier); // atk/atkSpeed magnitudes; hp/def flow through the attribute seed below
    // Six attributes (tier seed, then the def's per-unit spread wins) + the non-attribute combat stats.
    const base: Record<string, number> = { ...tierAttributes(seedTier), atk: ts.atk, atkSpeed: ts.atkSpeed, reach: b.reach };
    for (const [k, v] of Object.entries(u.attributes ?? {})) if (v !== undefined) base[k] = v;
    const attributes = new StatBlock(base);
    deriveAttributeStats(attributes); // maxHp/maxStam/def derive from health/endurance/defense
    if (u.hpMult !== undefined) attributes.add({ stat: 'maxHp', op: 'mulPct', value: u.hpMult - 1, source: 'unit:hpBloat' }); // elites bloat HP beyond their power tier
    const hp = Math.round(attributes.get('maxHp'));
    const maxStam = Math.round(attributes.get('maxStam'));
    const profile = AIProfiles.get(u.aiProfile);
    // tier-gated advanced movement: dash is granted as a normal ability; sprint is a brain capability flag
    const ti = tierIndex(u.tier);
    const canSprint = ti >= tierIndex(SPRINT_MIN_TIER);
    const canDash = ti >= tierIndex(DASH_MIN_TIER);
    const granted = new Set([u.attackAbility]);
    if (canDash) granted.add('ability.dodge');
    const e = this.world.create({
      transform: { x, y, angle: 0, r: b.r },
      mover: { vx: 0, vy: 0, speed: b.speed, mass: b.mass, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
      health: { hp, maxHp: hp, dead: false, hitFlash: 0, iframes: 0 },
      faction: { id: faction },
      combatant: defaultCombatant(maxStam),
      attributes,
      tags: new TagSet(),
      loadout: { granted, cd: new Map(), primary: u.attackAbility, heavy: '', dash: canDash ? 'ability.dodge' : '', slots: [] },
      effects: { active: [], seq: 0 }, // EVERY actor can carry effects (dodge i-frames…) — the Moat, not hero-only
      ai: { brain: actorBrain, bb: { state: 'wander', home: { x, y }, wanderT: this.rng.range(0, 2), boss: !!u.boss, profile, canSprint, betrayHpFrac: u.betrayHpFrac ?? profile.betrayHpFrac, lastSeenX: x, lastSeenY: y, lostT: 0 } },
      render: { draw: b.draw, baseColor: b.baseColor, hatColor: b.hatColor, bob: 0, showHpBar: true },
      identity: { name: u.name, tier: u.tier },
    });
    if (u.gold != null) e.loot = { gold: u.gold }; // only lootable units carry gold (townsfolk don't)
    if (u.dialogue) e.npc = { dialogue: u.dialogue }; // a unit whose def has lines is conversable (verb.talk)
    if (squad) e.squad = squad;
    const weaponId = weapon ?? u.weapon; // explicit override, else the unit's defined weapon (e.g. Brute's cutlass)
    if (weaponId) giveWeapon(e, weaponId);
    for (const id of u.accessories ?? []) wearAccessory(e, id);
    return e;
  }

  spawnPickup(kind: 'weapon' | 'fruit', defId: string, x: number, y: number): Entity {
    const label = kind === 'weapon' ? Weapons.get(defId).name : Fruits.get(defId).name;
    return this.world.create({
      transform: { x, y, angle: 0, r: 10 },
      pickup: { kind, defId, label },
      render: { draw: 'pickup', baseColor: 0xffffff, bob: 0 },
    });
  }

  spawnShip(hullId: string, x: number, y: number, faction: FactionId, anchored = true): Entity {
    const d = ShipHulls.get(hullId);
    return this.world.create({
      transform: { x, y, angle: 0, r: d.r },
      health: { hp: d.hp, maxHp: d.hp, dead: false, hitFlash: 0, iframes: 0 },
      faction: { id: faction },
      ship: { hull: hullId, mode: 'exploration', anchored, speed: 0, throttle: 0 },
      render: { draw: 'ship', baseColor: d.color, bob: 0, rotateToAngle: true, depthBias: -4 },
    });
  }
}
