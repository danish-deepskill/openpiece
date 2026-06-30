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
    default: 'hostile', // hostile to everyone (but allied with their own kind)
  },
  civilians: {
    id: 'civilians',
    name: 'Townsfolk',
    color: 0x3f7f4a,
    default: 'neutral',
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

export class Factions {
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

  isAlly(a: FactionId, b: FactionId): boolean {
    return a === b || this.stance(a, b) === 'ally';
  }
}

/** Shared singleton, like the EventBus. Content/data, so a singleton is fine. */
export const factions = new Factions();
