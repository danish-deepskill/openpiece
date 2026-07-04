import { ATTRIBUTE_IDS, type AttributeId } from '../combat/attributes';
import { tierColor } from '../combat/PowerTier';
import { FactionDefs } from '../defs/factions';
import { equippedLabels, inventoryLabels } from '../defs/items';
import type { Entity } from '../ecs/components';

/**
 * One unit's plate, projected to plain data — the SAME shape for every unit (the Moat at the UI layer:
 * the player's HUD and the inspect panel render this identical view-model, so the two can never drift).
 * Phaser-free on purpose: WorldScene/InspectSystem build it from sim components and publish it through the
 * registry; HudScene only renders. A headless server could ship this struct to a client verbatim.
 */
export interface UnitPlateView {
  name: string;
  tier: string;
  /** CSS hex for the tier chip (rank color ramp from PowerTier). */
  tierColor: string;
  factionName: string;
  /** 0xrrggbb for faction-tinted accents (matches the unit's ring color in-world). */
  factionColor: number;
  squadName: string | null;
  /** FSM state for AI-driven units; null for the controlled unit — input drives it, its blackboard lies. */
  aiState: string | null;
  hp: number;
  maxHp: number;
  stam: number | null;
  maxStam: number | null;
  /** Guard strain (combat/guard) — an INVERSE pool: the bar FILLS toward the break. Null for non-combatants. */
  posture: number | null;
  maxPosture: number | null;
  /** The six allocatable attributes (combat/attributes.ts), FINAL values incl. modifiers. */
  attributes: Record<AttributeId, number>;
  atk: number;
  /** EFFECTIVE flat reduction (defense attribute + gear) — the number Damage.apply actually subtracts. */
  def: number;
  atkSpeed: number;
  reach: number;
  /** Worn equipment, one label per named slot ("Hat: Straw Hat" / "Armor: —") — shown on EVERY plate, so
   *  V+click reads a bandit's gear the same way the HUD reads yours. */
  equipped: string[];
  /** Owned-unequipped items (the bag); empty for most units. */
  inventory: string[];
}

/** Project any unit to its plate view; null for non-units (pickups, bare ships — no identity/health). */
export function unitPlateView(e: Entity): UnitPlateView | null {
  if (!e.identity || !e.health) return null;
  const sb = e.attributes;
  const attributes = {} as Record<AttributeId, number>;
  for (const id of ATTRIBUTE_IDS) attributes[id] = sb?.get(id) ?? 0;
  const fac = e.faction ? FactionDefs[e.faction.id] : undefined;
  return {
    name: e.identity.name,
    tier: e.identity.tier ?? '',
    tierColor: tierColor(e.identity.tier ?? ''),
    factionName: fac?.name ?? 'Unaligned',
    factionColor: fac?.color ?? 0x9a9a9a,
    squadName: e.squad?.name ?? null,
    aiState: e.control ? null : (e.ai?.bb.state ?? null),
    hp: e.health.hp,
    maxHp: e.health.maxHp,
    stam: e.combatant?.stam ?? null,
    maxStam: e.combatant?.maxStam ?? null,
    posture: e.combatant?.posture ?? null,
    maxPosture: e.combatant?.maxPosture ?? null,
    attributes,
    atk: sb?.get('atk') ?? 0,
    def: sb?.get('def') ?? 0,
    atkSpeed: sb?.get('atkSpeed') ?? 0,
    reach: sb?.get('reach') ?? 0,
    equipped: equippedLabels(e),
    inventory: inventoryLabels(e),
  };
}
