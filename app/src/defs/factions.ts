/**
 * Data-driven faction system. A `faction` component holds a `FactionId`; hostility is
 * resolved through a relations matrix, never hardcoded team checks. New allegiances
 * (Marines, Cipher Pol, individual pirate crews, …) are added as data — zero system
 * changes. Stance lookup: explicit per-faction stance > faction default > 'neutral';
 * a faction is always 'ally' with itself.
 */
export type FactionId =
  | 'straw_hat'
  | 'bandits'
  | 'civilians'
  | 'wildlife'
  | 'marines'
  | 'revolutionary'
  | 'worldgov'
  | 'pirates';

export type Stance = 'ally' | 'neutral' | 'hostile';

export interface FactionDef {
  id: FactionId;
  name: string;
  color: number;
  /** Stance toward any faction not listed in `stances`. */
  default: Stance;
  stances?: Partial<Record<FactionId, Stance>>;
}

export const FactionDefs: Record<FactionId, FactionDef> = {
  straw_hat: {
    id: 'straw_hat',
    name: 'Straw Hat Crew',
    color: 0xd4483b,
    default: 'neutral',
    stances: { bandits: 'hostile', marines: 'hostile', worldgov: 'hostile', civilians: 'ally' },
  },
  bandits: {
    id: 'bandits',
    name: 'Island Bandits',
    color: 0xb5483a,
    default: 'hostile', // hostile to every FACTION of people (allied with their own kind)…
    stances: { wildlife: 'neutral' }, // …but they don't hunt animals — wildlife is only ever prey to the player
  },
  civilians: {
    id: 'civilians',
    name: 'Townsfolk',
    color: 0x3f7f4a,
    default: 'neutral',
    // allied with the player's crew; at war with the bandits (so townsfolk defend themselves + the town)
    stances: { straw_hat: 'ally', bandits: 'hostile' },
  },
  wildlife: {
    id: 'wildlife',
    name: 'Wildlife',
    color: 0x9a7b4f, // tan; wildlife is neutral to ALL — passive critters (cows/pigs) nobody's AI hunts…
    default: 'neutral', // …but the player can still strike them (see Factions.canHarm), so they're huntable
  },
  // --- defined for the road ahead; not yet spawned ---
  marines: {
    id: 'marines',
    name: 'Marines',
    color: 0x2f6fae,
    default: 'neutral',
    stances: { pirates: 'hostile', straw_hat: 'hostile', revolutionary: 'hostile', bandits: 'hostile' },
  },
  revolutionary: {
    id: 'revolutionary',
    name: 'Revolutionary Army',
    color: 0x8a5ad8,
    default: 'neutral',
    stances: { worldgov: 'hostile', marines: 'hostile' },
  },
  worldgov: {
    id: 'worldgov',
    name: 'World Government',
    color: 0xe7e2d4,
    default: 'neutral',
    stances: { revolutionary: 'hostile', pirates: 'hostile', straw_hat: 'hostile' },
  },
  pirates: {
    id: 'pirates',
    name: 'Rival Pirates',
    color: 0x6a3f8a,
    default: 'neutral',
    stances: { marines: 'hostile', worldgov: 'hostile' },
  },
};

export class FactionRelations {
  constructor(private readonly defs: Record<FactionId, FactionDef> = FactionDefs) {}

  def(id: FactionId): FactionDef {
    return this.defs[id];
  }

  stance(a: FactionId, b: FactionId): Stance {
    if (a === b) return 'ally';
    const da = this.defs[a];
    return da?.stances?.[b] ?? da?.default ?? 'neutral';
  }

  isHostile(a: FactionId, b: FactionId): boolean {
    return this.stance(a, b) === 'hostile';
  }

  /** Can A's attack damage B? Anything that isn't an ally — hostiles AND neutral wildlife (so critters are
   *  huntable), but never a friend. AI *targeting* still uses isHostile; this only gates what a swing lands on. */
  canHarm(a: FactionId, b: FactionId): boolean {
    return !this.isAlly(a, b);
  }

  isAlly(a: FactionId, b: FactionId): boolean {
    return a === b || this.stance(a, b) === 'ally';
  }
}

/** Shared singleton, like the EventBus — stateless data/contract, so a singleton is allowed (see DESIGN_PATTERNS §5). */
export const factions = new FactionRelations();

/** The faction a fresh game's controlled hero belongs to (used as the no-controlled-entity fallback). */
export const DEFAULT_PLAYER_FACTION: FactionId = 'straw_hat';
