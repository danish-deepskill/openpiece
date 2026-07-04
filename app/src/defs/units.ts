import { Registry, type ContentId, type Def } from '../core/Registry';
import type { AttributeId } from '../combat/attributes';
import type { PowerTier } from '../combat/PowerTier';
import type { BodyKey } from './bodies';
import type { FactionId } from './factions';

/**
 * A spawnable unit = a body archetype (identity) + a PowerTier (combat magnitudes) + role wiring
 * (faction, AI profile, basic attack, loot). The same body appears at many tiers (a grunt body is a
 * thug at F-, a brute at F+), so "make a tougher enemy" is a data entry, not new code. Content is data.
 */
export interface UnitDef extends Def {
  name: string;
  body: BodyKey;
  /** Rank tier — drives nameplate label/color, movement gates, and (future) bounty/region. */
  tier: PowerTier;
  /** Tier the combat stats (hp/atk/def/atkSpeed) are read from; defaults to `tier`. Lets a unit be ranked
   *  higher than it actually fights — e.g. ranked E- (combatant, can sprint) but with F- fodder stats. */
  statTier?: PowerTier;
  /** Per-unit attribute spread: REPLACES the tier seed per attribute (absolute points, not a delta —
   *  registry canon: child values replace, never merge). E.g. `{ health: 12 }` makes a glass cannon at any
   *  tier; omitted attributes keep their seed. Derived stats (maxHp/maxStam/def) follow automatically. */
  attributes?: Partial<Record<AttributeId, number>>;
  faction: FactionId;
  aiProfile: ContentId;
  attackAbility: ContentId;
  gold?: number;
  /** Starting weapon, auto-equipped at spawn (its strike/mods/tags replace the bare-handed kit). */
  weapon?: ContentId;
  /** Accessories worn at spawn (one per body slot — see defs/accessories). */
  accessories?: ContentId[];
  /** Lines spoken when Talked to (E). Presence attaches an `npc` component → the unit is conversable. */
  dialogue?: string[];
  /** HP bloat multiplier on top of the tier baseline (elites/bosses are tankier than their power tier). */
  hpMult?: number;
  /** Per-unit friendly-fire tolerance — overrides the AI profile's `betrayHpFrac` for THIS unit (a loyal
   *  lieutenant at 0.4, a jumpy recruit at 0.95). Omitted ⇒ the profile default. See aiProfiles.betrayHpFrac. */
  betrayHpFrac?: number;
  boss?: boolean;
}

/**
 * Tier gates for advanced movement (applied to AI units at spawn — see ecs/spawn). A unit at or above the
 * gate gains the capability; below it, it plods. Combat starts at E- (the F bands are non-combat NPCs):
 * every real fighter can sprint (≥ E-), and the tougher ones dash (≥ E+). One-line change to retune.
 */
export const SPRINT_MIN_TIER: PowerTier = 'E-';
export const DASH_MIN_TIER: PowerTier = 'E+';

/** The base kit EVERY actor falls back to (the bare-handed loadout) — the ONE home for these ids; equip.ts
 *  and spawns reference this, never string literals (CLAUDE.md: no hardcoded content lists in code). */
export const BASE_KIT = { primary: 'ability.punch', heavy: 'ability.kick', dash: 'ability.dodge' } as const;

export const Units = new Registry<UnitDef>('Units', (u) => {
  for (const [k, v] of Object.entries(u.attributes ?? {}))
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return `attributes.${k} must be a finite number ≥ 0 (got ${v})`;
  if (u.hpMult !== undefined && !(u.hpMult > 0)) return `hpMult must be > 0 (got ${u.hpMult})`; // ≤0 would spawn a corpse
  if (u.betrayHpFrac !== undefined && (u.betrayHpFrac < 0 || u.betrayHpFrac > 1)) return `betrayHpFrac must be in [0, 1] (got ${u.betrayHpFrac})`;
  return null;
});

Units.registerAll([
  // the player's body — same data path as everyone else; what makes it "the player" is the control tag
  // spawns BARE-HEADED — the straw hat is found in the cutlass house (WorldGen pickups), not worn from birth
  { id: 'unit.hero', name: 'Captain', body: 'hero', tier: 'D-', statTier: 'E-', faction: 'straw_hat', aiProfile: 'ai.rusher', attackAbility: 'ability.punch' },
  // bandit fodder: ranked E-/E/E+ (combatants who sprint), but kept at their original F-tier stats
  { id: 'unit.thug', name: 'Thug', body: 'grunt', tier: 'E-', statTier: 'F-', faction: 'bandits', aiProfile: 'ai.rusher', attackAbility: 'ability.banditStrike', gold: 8 },
  { id: 'unit.bandit', name: 'Bandit', body: 'grunt', tier: 'E', statTier: 'F', faction: 'bandits', aiProfile: 'ai.rusher', attackAbility: 'ability.banditStrike', gold: 12, weapon: 'weapon.knife', accessories: ['accessory.banditHat'] },
  { id: 'unit.brute', name: 'Brute', body: 'grunt', tier: 'E+', statTier: 'F+', faction: 'bandits', aiProfile: 'ai.flanker', attackAbility: 'ability.banditStrike', gold: 18, weapon: 'weapon.cutlass', accessories: ['accessory.soldierHelmet'] },
  // mini-boss captain: ranked D- (dash-capable), HP-bloated, but at the original E- stat line
  { id: 'unit.captain', name: 'Captain', body: 'captain', tier: 'D-', statTier: 'E-', faction: 'bandits', aiProfile: 'ai.rusher', attackAbility: 'ability.captainCleave', gold: 80, hpMult: 2.4, boss: true },
  // a townsperson: a FULL unit on the SAME stack as everyone (the Moat) — tier F, wanders, can be attacked,
  // self-defends with fists. Allied to the player, hostile to bandits (see defs/factions).
  {
    id: 'unit.villager',
    name: 'Villager',
    body: 'villager',
    tier: 'F',
    faction: 'civilians',
    aiProfile: 'ai.townsfolk',
    attackAbility: 'ability.punch',
    dialogue: [
      'Welcome to the island, stranger.',
      'The Dock Gang runs the east side — give them a wide berth.',
      'Word is a Devil Fruit washed ashore; someone stashed it in one of the houses.',
    ],
  },
  // passive wildlife (moomoo-style critters): wander their patch, flee when struck, never fight. Neutral faction
  // so no AI hunts them, but the player can — HP-bloated a little so a kill takes a few swings, not one.
  { id: 'unit.cow', name: 'Cow', body: 'cow', tier: 'F', faction: 'wildlife', aiProfile: 'ai.critter', attackAbility: 'ability.punch', hpMult: 2.5 },
  { id: 'unit.pig', name: 'Pig', body: 'pig', tier: 'F', faction: 'wildlife', aiProfile: 'ai.critter', attackAbility: 'ability.punch', hpMult: 3.5 },
]);
