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
  /** RANK ACCENT — a short stripe on each shoulder marking rank at a glance (e.g. an officer vs a plain
   *  marine). Omitted ⇒ no stripe. Cosmetic identity only; drawn on the humanoid body. */
  accent?: number;
  /** How many parallel rank stripes per shoulder (only with `accent`). Omitted ⇒ 1. More bars = higher rank. */
  rankStripes?: number;
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
  gold?: number;
  /** Starting weapon, auto-equipped at spawn (its strike/mods/tags replace the bare-handed kit). */
  weapon?: ContentId;
  /** Fighting STYLE, equipped at spawn — grants a martial art's dash + unarmed strikes (a bare-handed unit's
   *  basic attack comes from HERE, e.g. style.brawl → banditStrike). A weapon still out-prioritises it. The
   *  primary resolves: weapon ?? fruit ?? style ?? the base fist — one rule, no per-unit attack field. */
  style?: ContentId;
  /** DEVIL FRUIT, eaten at spawn (defs/layers → Fruits) — grants its abilities (light/heavy + slots), mods,
   *  and tags via the SAME equip('fruit') path the player uses. Sits between weapon and style in the primary
   *  precedence (weapon ?? FRUIT ?? style ?? fist), so a fruit-user's light/heavy become the fruit's while
   *  unarmed. This is how an AI unit is BORN with a fruit (Luffy = fruit.gomu) — not a hero-only spawn hack. */
  fruit?: ContentId;
  /** Accessories worn at spawn (one per body slot — see defs/accessories). */
  accessories?: ContentId[];
  /** TRAITS — innate talents this unit HAS (defs/traits): each grants its modifiers/tags. A plain id list you
   *  add to / remove from (the same has-this-marker model as ability grants). E.g. `['trait.mobileAttack.slow']`
   *  lets it shuffle while swinging; omitted ⇒ none (rooted while attacking, the default). */
  traits?: ContentId[];
  /** Lines spoken when Talked to (E). Presence attaches an `npc` component → the unit is conversable. */
  dialogue?: string[];
  /** RECRUITABLE — after the talk dialogue, offer a yes/no to bring this unit into your crew (faction →
   *  straw_hat + follows you, fighting enemies on sight). Needs `dialogue` (talk is the trigger). */
  recruitable?: boolean;
  /** BAG capacity in STACKS (ITEMS.md §3): omitted ⇒ BAG_SLOTS (10). 0 = carries nothing (fauna). The ship's
   *  hold is where wealth lives (ShipDef.holdSlots); the bag is your pockets — a deliberate small number. */
  bagSlots?: number;
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
 * Tier gate for the DASH (applied to AI units at spawn — see ecs/spawn). A unit at or above the gate gains it;
 * below it, it plods. Sprint is NOT tier-gated — it's an opt-in `trait.sprinter` per unit (defs/traits).
 */
export const DASH_MIN_TIER: PowerTier = 'E+';

/** Default bag capacity in stacks (ITEMS.md §3's starting number) — per-unit override via UnitDef.bagSlots. */
export const BAG_SLOTS = 10;

/** The base kit EVERY actor falls back to (the bare-handed loadout) — the ONE home for these ids; equip.ts
 *  and spawns reference this, never string literals (CLAUDE.md: no hardcoded content lists in code). */
export const BASE_KIT = { primary: 'ability.punch', heavy: 'ability.kick', dash: 'ability.roll' } as const;

/** The guard abilities every real COMBATANT is granted (block/parry are fundamental verbs — COMBAT.md). A
 *  unit HAS the capability iff these are in its loadout.granted; non-fighters (villager/critters) skip them
 *  via `noGuard`. One home for the ids; the guard engine + capability checks read the grant, not literals. */
export const GUARD_KIT = ['ability.block', 'ability.parry'] as const;

export const Units = new Registry<UnitDef>('Units', (u) => {
  for (const [k, v] of Object.entries(u.attributes ?? {}))
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return `attributes.${k} must be a finite number ≥ 0 (got ${v})`;
  if (u.hpMult !== undefined && !(u.hpMult > 0)) return `hpMult must be > 0 (got ${u.hpMult})`; // ≤0 would spawn a corpse
  if (u.bagSlots !== undefined && (!Number.isInteger(u.bagSlots) || u.bagSlots < 0)) return `bagSlots must be an integer ≥ 0 (got ${u.bagSlots})`;
  if (u.betrayHpFrac !== undefined && (u.betrayHpFrac < 0 || u.betrayHpFrac > 1)) return `betrayHpFrac must be in [0, 1] (got ${u.betrayHpFrac})`;
  return null;
});

// outfit palette (torso/shoulder garb + dialogue-ring hat color) — the per-unit LOOK on top of the body's
// rig+skin. Named so the roster reads by intent, not hex; same-body units differ only by which they wear.
const GARB = { hero: 0xb5342a, bandit: 0x6b4a3a, boss: 0x3a2f4a, civilian: 0x4a6a8a, soldier: 0x2f4a6a, marine: 0xffffff } as const; // marine = TEMP white naval shirt (Marine Officer)
const HAT = { hero: 0xf0c040, dark: 0x2a0d0d, civilian: 0x2e5a35 } as const;

Units.registerAll([
  // the player — same data path as everyone; what makes it "the player" is the control tag. Spawns
  // BARE-HEADED (the straw hat is found in the cutlass house). Heroic human build, red-vest outfit.
  // unarmed → the base-kit fist (attackAbility omitted ⇒ BASE_KIT.primary).
  { id: 'unit.hero', name: 'Captain', race: 'race.heroic', garb: GARB.hero, hatColor: HAT.hero, tier: 'D-', faction: 'straw_hat', aiProfile: 'ai.rusher', traits: ['trait.sprinter'] },
  // bandit fodder: ranked E-/E/E+ and now fighting AT that rank (statTier = tier) — a raised floor, so even
  // the weakest mook is a real E-tier combatant, not F-tier chaff. Plain human build, ragged browns. The
  // basic attack comes from a LAYER: Thug's from its brawling STYLE (banditStrike), the weaponed bandit/brute
  // from their WEAPON (dagger stab / cutlass cut) — no per-unit attack field; the primary resolves at spawn.
  { id: 'unit.thug', name: 'Thug', garb: GARB.bandit, hatColor: HAT.dark, tier: 'E-', faction: 'bandits', aiProfile: 'ai.rusher', style: 'style.brawl', gold: 8 },
  { id: 'unit.bandit', name: 'Bandit', garb: GARB.bandit, hatColor: HAT.dark, tier: 'E', faction: 'bandits', aiProfile: 'ai.rusher', gold: 12, weapon: 'weapon.dagger', accessories: ['accessory.banditHat'], traits: ['trait.sprinter'] },
  { id: 'unit.brute', name: 'Brute', garb: GARB.bandit, hatColor: HAT.dark, tier: 'E+', faction: 'bandits', aiProfile: 'ai.flanker', gold: 18, weapon: 'weapon.cutlass', accessories: ['accessory.bruteHelmet', 'accessory.kaidoArmor'], traits: ['trait.sprinter'] }, // TEST: brute wears the AI-gen chest armor so you can eyeball fit in-game
  // the SOLDIER — the GUARD-MASTER test unit (sword + helmet, its own STEEL-BLUE uniform so it reads apart
  // from the brown fodder). D- (a rank ABOVE the E+ Brute fodder — it's a trained fighter, not a mook).
  // ai.master blocks + parries relentlessly — the counter is the FEINT. Attack = the SWORD's (attackAbility omitted).
  { id: 'unit.soldier', name: 'Soldier', garb: GARB.soldier, hatColor: HAT.dark, tier: 'D-', faction: 'bandits', aiProfile: 'ai.master', gold: 30, weapon: 'weapon.sword', accessories: ['accessory.soldierHelmet'], dialogue: ['A blade for hire, if the crew is worth it.', "You've got the look of a captain going places."], recruitable: true, traits: ['trait.sprinter'] },
  // the MARINE OFFICER — the RANGED test unit (docs #19): a C- musketeer that KITES (ai.marineOfficer keeps
  // ~230px, leads the ball) and fires a TRAVELLING shot you can see + dodge. TEMP white naval shirt + officer's
  // cap. Attack = the MARINE MUSKET's primary (attackAbility omitted → weapon.marineMusket's marineMusketShot,
  // the faster 12-tiles/s ball). The home-island test foe (WorldScene) so the ranged AI is what you meet near spawn.
  // endurance 4 = "E-" fitness grade (the 0–30 tier-index number, 1=F- … 30=X+; see attributes.STAM_BASE) → a
  // 140 stamina pool vs every other unit's F- floor (endurance 1 → 110). The Marine is the first unit with raised
  // endurance — a drilled soldier chains a few more moves before winding. Per-unit override (REPLACES the seed),
  // decoupled from his C- COMBAT rank on purpose (stamina is fitness, not rank — a knob, see UnitDef.attributes).
  { id: 'unit.marineOfficer', name: 'Marine Officer', garb: GARB.marine, hatColor: HAT.dark, accent: 0x2a6fc4, tier: 'C-', faction: 'marine', aiProfile: 'ai.marineOfficer', gold: 30, attributes: { endurance: 4 }, weapon: 'weapon.marineMusket', accessories: ['accessory.marineOfficerHat'], traits: ['trait.sprinter', 'trait.swimmer'] }, // marine faction: hostile to the player (still the home-isle test foe) AND to the bandits — a Marine belongs to the Marines, not the gang. accent = blue shoulder stripes marking the officer vs a plain marine
  // the BRAWLER — the island's D- boss: a BARE-FISTED, BARE-HEADED aggressor. humanoid body + GIANT race
  // (renders large purely from race.giant's size mult — no special 'boss body'), HP-bloated, dash, dark coat.
  { id: 'unit.brawler', name: 'Brawler', race: 'race.giant', garb: GARB.boss, hatColor: HAT.dark, tier: 'D-', faction: 'bandits', aiProfile: 'ai.rusher', style: 'style.haymaker', gold: 80, hpMult: 2.4, boss: true, traits: ['trait.sprinter'] },
  // LUFFY — a D-tier rubber brawler: heroic build, wears the straw hat, and has eaten the Gomu Gomu no Mi
  // (fruit.gomu → pistol/gatling/rocket/stamp become his kit, the SAME fruit the player earns). ai.luffy is
  // his aggressive rush+charge brain. Faction bandits for now so he's a hostile DUEL target you can spar to
  // feel the rubber AI — flip to straw_hat (or recruitable) when he becomes a crewmate rather than a test foe.
  { id: 'unit.luffy', name: 'Luffy', race: 'race.heroic', garb: GARB.hero, hatColor: HAT.hero, tier: 'D', faction: 'bandits', aiProfile: 'ai.luffy', fruit: 'fruit.gomu', accessories: ['accessory.strawHat'], traits: ['trait.sprinter'], gold: 60 },
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
    noGuard: true, // untrained + bare-handed → the base-kit fist (no style, no weapon)
    dialogue: [
      'Welcome to the island, stranger.',
      'The Dock Gang runs the east side — give them a wide berth.',
      'Word is a Devil Fruit washed ashore; someone stashed it in one of the houses.',
    ],
  },
  // passive wildlife (moomoo-style critters): quadruped BODIES carry their own draw + hide + physique, so they
  // need no outfit and default race.human (×1). HP is a real `health` attribute (not hpMult) — a direct number,
  // ordered by BULK so it reads intuitively: pig (110) < cow (150) < bull (240). Enough that a kill takes a few
  // swings, not one.
  { id: 'unit.cow', name: 'Cow', body: 'body.cow', tier: 'F', faction: 'wildlife', aiProfile: 'ai.critter', attributes: { health: 300 }, noGuard: true, bagSlots: 0 },
  { id: 'unit.pig', name: 'Pig', body: 'body.pig', tier: 'F', faction: 'wildlife', aiProfile: 'ai.critter', attributes: { health: 220 }, noGuard: true, bagSlots: 0 },
  // the BULL — a TERRITORIAL beast (wildlife faction, so it's calm + huntable UNTIL you strike it, then it holds
  // a grudge and CHARGES). Tier E- = a real (weak) COMBATANT band (can sprint/charge, gets atk/def), and its
  // toughness is a big `health` attribute (240 HP — the tankiest animal, above the pig's ~207), NOT hpMult: a
  // bull's bulk is real stats. `health` REPLACES the tier's hp seed (registry canon: spread values replace), so
  // set it ABOVE the band, not below. Attack = the headbutt gore (style.gore). noGuard: animals don't block. gold = bounty.
  { id: 'unit.bull', name: 'Bull', body: 'body.bull', tier: 'E-', faction: 'wildlife', aiProfile: 'ai.bull', style: 'style.gore', attributes: { health: 480 }, gold: 40, noGuard: true, bagSlots: 0, traits: ['trait.sprinter'] }, // sprinter: the charge burst needs it
]);
