export type StatId = string;

export type ModifierOp =
  | 'flat' // added to the base
  | 'addPct' // summed, then applied as ×(1 + Σ)
  | 'mulPct' // applied multiplicatively as ×Π(1 + each)
  | 'override'; // replaces the final value (last override wins)

/**
 * A single stat modification, tagged with its `source` so it can be removed wholesale when the thing that
 * granted it goes away (unequip a weapon, expire a buff, remove a Combat Potential). Source-tracked
 * modifiers are the standard, debuggable way to manage layered RPG stats.
 */
export interface Modifier {
  stat: StatId;
  op: ModifierOp;
  value: number;
  /** e.g. 'weapon:cutlass', 'fruit:gomu', 'haki:armament', 'potential:ironbody', 'buff:rage'. */
  source: string;
}

/** Shared def-validator piece for any family that carries Modifiers (layers, accessories, effects):
 *  a NaN value or empty stat/source is a content bug that must fail at boot, not compute as 0 mid-game. */
export function modifierProblem(mods: readonly Modifier[] | undefined): string | null {
  for (const m of mods ?? []) {
    if (!m.stat) return 'modifier has an empty stat id';
    if (!Number.isFinite(m.value)) return `modifier '${m.stat}' value must be finite (got ${m.value})`;
    if (!m.source) return `modifier '${m.stat}' has an empty source`;
  }
  return null;
}
