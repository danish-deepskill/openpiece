import { Registry, type ContentId, type Def } from '../core/Registry';
import type { PowerTier } from '../combat/PowerTier';
import type { BodyKey } from './actors';
import type { FactionId } from './factions';

/**
 * A spawnable unit = a body archetype (identity) + a PowerTier (combat magnitudes) + role wiring
 * (faction, AI profile, basic attack, loot). The same body appears at many tiers (a grunt body is a
 * thug at F-, a brute at F+), so "make a tougher enemy" is a data entry, not new code. Content is data.
 */
export interface UnitDef extends Def {
  name: string;
  body: BodyKey;
  tier: PowerTier;
  faction: FactionId;
  aiProfile: ContentId;
  attackAbility: ContentId;
  gold?: number;
  /** HP bloat multiplier on top of the tier baseline (elites/bosses are tankier than their power tier). */
  hpMult?: number;
  boss?: boolean;
}

export const Units = new Registry<UnitDef>('Units');

Units.registerAll([
  // the player's body — same data path as everyone else; what makes it "the player" is the control tag
  { id: 'unit.hero', name: 'Captain', body: 'hero', tier: 'E-', faction: 'straw_hat', aiProfile: 'ai.rusher', attackAbility: 'ability.punch' },
  // bandit fodder: one body, three tiers → three stat variants
  { id: 'unit.thug', name: 'Thug', body: 'grunt', tier: 'F-', faction: 'bandits', aiProfile: 'ai.rusher', attackAbility: 'ability.banditStrike', gold: 8 },
  { id: 'unit.bandit', name: 'Bandit', body: 'grunt', tier: 'F', faction: 'bandits', aiProfile: 'ai.rusher', attackAbility: 'ability.banditStrike', gold: 12 },
  { id: 'unit.brute', name: 'Brute', body: 'grunt', tier: 'F+', faction: 'bandits', aiProfile: 'ai.flanker', attackAbility: 'ability.banditStrike', gold: 18 },
  // mini-boss captain: E- power, but HP-bloated so it reads as a tanky duel
  { id: 'unit.captain', name: 'Captain', body: 'captain', tier: 'E-', faction: 'bandits', aiProfile: 'ai.rusher', attackAbility: 'ability.captainCleave', gold: 80, hpMult: 2.4, boss: true },
]);
