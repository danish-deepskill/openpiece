import { actorBrain } from '../ai/brains';
import { deriveAttributeStats, STAM_BASE, STAM_PER_ENDURANCE, syncDerivedResources, tierAttributes } from '../combat/attributes';
import { tierIndex, tierStats } from '../combat/PowerTier';
import { StatBlock } from '../combat/StatBlock';
import { TagSet } from '../combat/TagSet';
import { wearAccessory } from '../combat/apparel';
import { equip, refreshLoadout } from '../combat/equip';
import type { Rng } from '../core/Rng';
import { Bodies } from '../defs/bodies';
import { Races } from '../defs/races';
import { DEFAULT_SIZE, Sizes } from '../defs/sizes';
import { AIProfiles } from '../defs/aiProfiles';
import { ShipHulls } from '../defs/ships';
import type { FactionId } from '../defs/factions';
import { Accessories } from '../defs/accessories';
import { itemName, type ItemRef } from '../defs/items';
import { MULTIPLIER_STAT_SEEDS, Traits } from '../defs/traits';
import { Weapons } from '../defs/layers';
import { BASE_KIT, DASH_MIN_TIER, GUARD_KIT, Units } from '../defs/units';
import type { Combatant, Entity } from './components';
import type { World } from './World';

/** Guard capacity for attribute-less combatants (no willpower to derive from) — matches the F- seed. */
export const BASE_POSTURE = 20;

/** The shared per-fight resource block — one literal, no drift. Spawns pass the endurance-derived
 *  `maxStam` / willpower-derived `maxPosture` attributes; the defaults cover attribute-less targets
 *  (possessing a prop/ship) — and MATCH the spawned F- floor (STAM_BASE + 1 endurance grade = 110), so a
 *  possessed backfilled body isn't quietly weaker than every spawned unit. */
export function defaultCombatant(maxStam: number = STAM_BASE + STAM_PER_ENDURANCE, maxPosture: number = BASE_POSTURE): Combatant {
  return { stam: maxStam, maxStam, combo: 0, comboT: 0, posture: 0, maxPosture };
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
    // PHYSICAL build = BODY baseline × RACE multiplier × SIZE band (the RimWorld split): body is the rig
    // (draw + baseline numbers + skin), race scales it (Giant 1.5×), size is individual stature. Size/reach/
    // mass all take race×size; walk SPEED is a race trait, not a stature one (a tall human isn't slower).
    const body = Bodies.get(u.body ?? 'body.humanoid'); // the rig + baseline
    const race = Races.get(u.race ?? 'race.human'); // the stat multiplier
    const stature = Sizes.get(u.size ?? DEFAULT_SIZE).mult;
    const bodyR = body.r * race.sizeMul * stature;
    const bodyReach = body.reach * race.reachMul * stature;
    const bodySpeed = body.speed * race.speedMul;
    const bodyMass = body.mass * race.massMul * stature;
    const seedTier = u.statTier ?? u.tier; // stats from statTier (else rank tier)
    const ts = tierStats(seedTier); // atk/atkSpeed magnitudes; hp/def flow through the attribute seed below
    // Six attributes (tier seed, then the def's per-unit spread wins) + the non-attribute combat stats +
    // the MULTIPLIER-stat seeds (base 1 — an absent stat reads 0 from StatBlock, which for a multiplier means
    // "frozen"; seeding neutral lets traits/gear compose with mulPct instead of override).
    const base: Record<string, number> = { ...tierAttributes(seedTier), ...MULTIPLIER_STAT_SEEDS, atk: ts.atk, atkSpeed: ts.atkSpeed, reach: bodyReach };
    for (const [k, v] of Object.entries(u.attributes ?? {})) if (v !== undefined) base[k] = v;
    const attributes = new StatBlock(base);
    deriveAttributeStats(attributes); // maxHp/maxStam/def derive from health/endurance/defense
    if (u.hpMult !== undefined) attributes.add({ stat: 'maxHp', op: 'mulPct', value: u.hpMult - 1, source: 'unit:hpBloat' }); // elites bloat HP beyond their power tier
    const hp = Math.round(attributes.get('maxHp'));
    const maxStam = Math.round(attributes.get('maxStam'));
    const profile = AIProfiles.get(u.aiProfile);
    // tier-gated DASH (a normal ability grant, the Moat). SPRINT is no longer tier-gated — it's an opt-in TRAIT
    // (trait.sprinter, applied below) so it's per-unit intentional, not "everyone ≥ E-". `canSprint` mirrors the
    // sprinter trait onto the blackboard as a HOT-PATH cache the brain reads each tick (loadout is the truth;
    // trySprint re-checks the grant).
    const ti = tierIndex(u.tier);
    const canSprint = (u.traits ?? []).includes('trait.sprinter');
    const canDash = ti >= tierIndex(DASH_MIN_TIER);
    // The unit's INNATE kit — the non-equipment half of the loadout, recorded on loadout.innate so
    // refreshLoadout re-derives granted = innate ∪ equipment on every equip/unequip (no drift, no preserve
    // special-cases). Base verbs: fist + kick (the base attacks), jump (SPACE — a fundamental movement verb);
    // roll gated by tier; guard (block/parry — COMBAT.md fundamentals) unless the unit opts out via noGuard;
    // TRAIT grants (sprint…) are innate too — a talent isn't equipment, so a loadout rebuild must keep it.
    const innate: string[] = [BASE_KIT.primary, BASE_KIT.heavy, 'ability.jump'];
    if (canDash) innate.push(BASE_KIT.dash);
    if (!u.noGuard) innate.push(...GUARD_KIT);
    for (const id of u.traits ?? []) for (const a of Traits.get(id).grants ?? []) innate.push(a);
    const granted = new Set<string>(innate);
    const e = this.world.create({
      transform: { x, y, angle: 0, r: bodyR },
      mover: { vx: 0, vy: 0, speed: bodySpeed, mass: bodyMass, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
      health: { hp, maxHp: hp, dead: false, hitFlash: 0, iframes: 0 },
      faction: { id: faction },
      combatant: defaultCombatant(maxStam, Math.round(attributes.get('maxPosture'))),
      attributes,
      tags: new TagSet(),
      loadout: { granted, innate, cd: new Map(), cdMax: new Map(), primary: BASE_KIT.primary, heavy: BASE_KIT.heavy, dash: canDash ? BASE_KIT.dash : '', slots: [] },
      effects: { active: [], seq: 0 }, // EVERY actor can carry effects (dodge i-frames…) — the Moat, not hero-only
      ai: { brain: actorBrain, bb: { state: 'wander', home: { x, y }, wanderT: this.rng.range(0, 2), boss: !!u.boss, profile, canSprint, betrayHpFrac: u.betrayHpFrac ?? profile.betrayHpFrac, lastSeenX: x, lastSeenY: y, lostT: 0 } },
      // look = the BODY's rig (draw) + skin, with the unit's OUTFIT (garb) layered on; garb omitted ⇒ the
      // draw darkens the skin as a fallback (see actorDraws). hatColor is a per-unit accent (dialogue ring).
      render: { draw: body.draw, baseColor: body.skin, garbColor: u.garb, accentColor: u.accent, rankStripes: u.rankStripes, hatColor: u.hatColor, bob: 0, showHpBar: true },
      identity: { name: u.name, tier: u.tier },
    });
    if (u.gold != null) e.loot = { gold: u.gold }; // only lootable units carry gold (townsfolk don't)
    if (u.dialogue) e.npc = { dialogue: u.dialogue, recruitable: u.recruitable }; // conversable (verb.talk); may offer recruit
    if (squad) e.squad = squad;
    // EQUIPMENT — all through the ONE path (equip → refreshLoadout), same as the player mid-game; the old
    // giveWeapon/giveStyle spawn shortcuts hand-patched the loadout and drifted from refreshLoadout repeatedly.
    // Order no longer matters: refreshLoadout resolves the canonical primary precedence (weapon ?? fruit ??
    // style ?? fist) from ALL equipment every time.
    if (u.style) equip(e, 'style', u.style);
    const weaponId = weapon ?? u.weapon; // explicit override, else the unit's defined weapon (e.g. Brute's cutlass)
    if (weaponId) equip(e, 'weapon', weaponId);
    if (u.fruit) equip(e, 'fruit', u.fruit);
    for (const id of u.accessories ?? []) wearAccessory(e, id);
    // TRAITS: innate talents — modifiers + tags apply here (source-tracked, so a retrait wipes them); the
    // ability GRANTS were already folded into loadout.innate above (refreshLoadout re-derives them from there).
    for (const id of u.traits ?? []) {
      const tr = Traits.get(id);
      if (tr.modifiers) e.attributes!.addAll(tr.modifiers);
      if (tr.tags) for (const t of tr.tags) e.tags!.add(t);
    }
    syncDerivedResources(e); // trait modifiers may move maxHp/maxStam ceilings — sync even for equipment-less units
    return e;
  }

  spawnPickup(item: ItemRef, x: number, y: number): Entity {
    // an item with real sprite art (a sprite-visual accessory OR weapon) shows THAT sprite on the ground —
    // its texture is loaded by id in BootScene. Procedural items fall back to the pickup glyph.
    const acc = item.cat === 'accessory' ? Accessories.get(item.id) : undefined;
    const wpn = item.cat === 'weapon' ? Weapons.get(item.id) : undefined;
    const sprite = acc?.visual.kind === 'sprite' || wpn?.visual?.kind === 'sprite' ? item.id : undefined;
    return this.world.create({
      transform: { x, y, angle: 0, r: 12 },
      pickup: { item, label: itemName(item) },
      render: sprite
        ? { draw: 'pickup', sprite, spriteScale: 1.5, baseColor: 0xffffff, bob: 0 }
        : { draw: 'pickup', baseColor: 0xffffff, bob: 0 },
    });
  }

  spawnShip(hullId: string, x: number, y: number, faction: FactionId, anchored = true): Entity {
    const d = ShipHulls.get(hullId);
    return this.world.create({
      transform: { x, y, angle: 0, r: d.r },
      health: { hp: d.hp, maxHp: d.hp, dead: false, hitFlash: 0, iframes: 0 },
      faction: { id: faction },
      ship: { hull: hullId, mode: 'exploration', sail: 'furled', anchor: anchored ? 'dropped' : 'up', anchorT: 0, back: 0, lash: false, helmOrder: 0, rudder: 0, yaw: 0, speed: 0, vx: 0, vy: 0 },
      render: { draw: 'ship', baseColor: d.color, bob: 0, rotateToAngle: true, depthBias: -4 },
    });
  }
}
