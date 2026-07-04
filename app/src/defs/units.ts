import { Registry, type ContentId, type Def } from '../core/Registry';
import type { AttributeId } from '../combat/attributes';
import type { PowerTier } from '../combat/PowerTier';
import type { BodyId } from './bodies';
import type { RaceId } from './races';
import type { SizeId } from './sizes';
import type { FactionId } from './factions';

/**
 * A spawnable unit (RimWorld's PawnKind) = a BODY (rig) + a RACE (stat mult) + a SIZE band + a PowerTier +
 * OUTFIT colors + role wiring. Four orthogonal axes: the same body appears at many races/tiers/outfits (a
 * brown human thug, a blue human soldier, a giant boss — all body.humanoid), so "make a bigger/tougher/
 * differently-built enemy" is a data entry, not new code. A 4-arm fishman = a new BODY + race.fishman.
 */
export interface UnitDef extends Def {
  name: string;
  /** The RIG — draw fn + baseline physique + skin (defs/bodies). Omitted ⇒ 'body.humanoid'. This is the
   *  anatomy axis (2-arm vs 4-arm vs quadruped); race scales it, size scales again. */
  body?: BodyId;
  /** Species STAT multiplier on the body's baseline (size/reach/speed/mass — defs/races). Omitted ⇒ race.human. */
  race?: RaceId;
  /** INDIVIDUAL stature within the race — a named band (defs/sizes) that multiplies size/reach/mass (NOT
   *  speed). Omitted ⇒ 'size.medium'. One Piece humans span average→admiral-tall; this is that variation
   *  (a big human = race.human + size.large). Composes with race: a large fishman = race.fishman × size.large. */
  size?: SizeId;
  /** OUTFIT: torso/shoulder (clothing) fill — the per-unit look on top of the race's shape+skin. Omitted ⇒
   *  a darkened skin. This is how same-race units differ (a brown bandit vs a blue soldier). */
  garb?: number;
  /** Dialogue-avatar ring / hat-band color. Omitted ⇒ a race/faction default in the draw. */
  hatColor?: number;
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
  /** Opt OUT of the fundamental guard grant (GUARD_KIT) — a non-fighter (villager, wildlife) can't block or
   *  parry. The rare NEGATIVE exception: guarding is universal, so we mark who LACKS it, not who has it. */
  noGuard?: boolean;
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

/** The guard abilities every real COMBATANT is granted (block/parry are fundamental verbs — COMBAT.md). A
 *  unit HAS the capability iff these are in its loadout.granted; non-fighters (villager/critters) skip them
 *  via `noGuard`. One home for the ids; the guard engine + capability checks read the grant, not literals. */
export const GUARD_KIT = ['ability.block', 'ability.parry'] as const;

export const Units = new Registry<UnitDef>('Units', (u) => {
  for (const [k, v] of Object.entries(u.attributes ?? {}))
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return `attributes.${k} must be a finite number ≥ 0 (got ${v})`;
  if (u.hpMult !== undefined && !(u.hpMult > 0)) return `hpMult must be > 0 (got ${u.hpMult})`; // ≤0 would spawn a corpse
  if (u.betrayHpFrac !== undefined && (u.betrayHpFrac < 0 || u.betrayHpFrac > 1)) return `betrayHpFrac must be in [0, 1] (got ${u.betrayHpFrac})`;
  return null;
});

// outfit palette (torso/shoulder garb + dialogue-ring hat color) — the per-unit LOOK on top of the body's
// rig+skin. Named so the roster reads by intent, not hex; same-body units differ only by which they wear.
const GARB = { hero: 0xb5342a, bandit: 0x6b4a3a, boss: 0x3a2f4a, civilian: 0x4a6a8a, soldier: 0x2f4a6a } as const;
const HAT = { hero: 0xf0c040, dark: 0x2a0d0d, civilian: 0x2e5a35 } as const;

Units.registerAll([
  // the player — same data path as everyone; what makes it "the player" is the control tag. Spawns
  // BARE-HEADED (the straw hat is found in the cutlass house). Heroic human build, red-vest outfit.
  { id: 'unit.hero', name: 'Captain', race: 'race.heroic', garb: GARB.hero, hatColor: HAT.hero, tier: 'D-', faction: 'straw_hat', aiProfile: 'ai.rusher', attackAbility: 'ability.punch' },
  // bandit fodder: ranked E-/E/E+ and now fighting AT that rank (statTier = tier) — a raised floor, so even
  // the weakest mook is a real E-tier combatant, not F-tier chaff. Plain human build, ragged browns.
  { id: 'unit.thug', name: 'Thug', garb: GARB.bandit, hatColor: HAT.dark, tier: 'E-', faction: 'bandits', aiProfile: 'ai.rusher', attackAbility: 'ability.banditStrike', gold: 8 },
  { id: 'unit.bandit', name: 'Bandit', garb: GARB.bandit, hatColor: HAT.dark, tier: 'E', faction: 'bandits', aiProfile: 'ai.rusher', attackAbility: 'ability.banditStrike', gold: 12, weapon: 'weapon.knife', accessories: ['accessory.banditHat'] },
  { id: 'unit.brute', name: 'Brute', garb: GARB.bandit, hatColor: HAT.dark, tier: 'E+', faction: 'bandits', aiProfile: 'ai.flanker', attackAbility: 'ability.banditStrike', gold: 18, weapon: 'weapon.cutlass', accessories: ['accessory.bruteHelmet'] },
  // the SOLDIER — the GUARD-MASTER test unit (sword + helmet, its own STEEL-BLUE uniform so it reads apart
  // from the brown fodder). D- (a rank ABOVE the E+ Brute fodder — it's a trained fighter, not a mook).
  // ai.master blocks + parries relentlessly — the counter is the FEINT.
  { id: 'unit.soldier', name: 'Soldier', garb: GARB.soldier, hatColor: HAT.dark, tier: 'D-', faction: 'bandits', aiProfile: 'ai.master', attackAbility: 'ability.swordSlash1', gold: 30, weapon: 'weapon.sword', accessories: ['accessory.soldierHelmet'] },
  // the BRAWLER — the island's D- boss: a BARE-FISTED, BARE-HEADED aggressor. humanoid body + GIANT race
  // (renders large purely from race.giant's size mult — no special 'boss body'), HP-bloated, dash, dark coat.
  { id: 'unit.brawler', name: 'Brawler', race: 'race.giant', garb: GARB.boss, hatColor: HAT.dark, tier: 'D-', faction: 'bandits', aiProfile: 'ai.rusher', attackAbility: 'ability.brawlerStrike', gold: 80, hpMult: 2.4, boss: true },
  // a townsperson: a FULL unit on the SAME stack as everyone (the Moat) — civilian build, work-shirt blue.
  // noGuard: an untrained civilian throws panicked punches but can't block/parry (the negative exception).
  {
    id: 'unit.villager',
    name: 'Villager',
    race: 'race.civilian',
    garb: GARB.civilian,
    hatColor: HAT.civilian,
    tier: 'F',
    faction: 'civilians',
    aiProfile: 'ai.townsfolk',
    attackAbility: 'ability.punch',
    noGuard: true,
    dialogue: [
      'Welcome to the island, stranger.',
      'The Dock Gang runs the east side — give them a wide berth.',
      'Word is a Devil Fruit washed ashore; someone stashed it in one of the houses.',
    ],
  },
  // passive wildlife (moomoo-style critters): quadruped BODIES carry their own draw + hide + physique, so
  // they need no outfit and default race.human (×1). HP-bloated a little so a kill takes a few swings, not one.
  { id: 'unit.cow', name: 'Cow', body: 'body.cow', tier: 'F', faction: 'wildlife', aiProfile: 'ai.critter', attackAbility: 'ability.punch', hpMult: 2.5, noGuard: true },
  { id: 'unit.pig', name: 'Pig', body: 'body.pig', tier: 'F', faction: 'wildlife', aiProfile: 'ai.critter', attackAbility: 'ability.punch', hpMult: 3.5, noGuard: true },
]);
