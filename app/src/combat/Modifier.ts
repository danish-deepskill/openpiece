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
