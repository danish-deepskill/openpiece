/**
 * How a def LOOKS — presentation-only data carried on content defs (RimWorld's GraphicData idea: the
 * rendering strategy is a DATA field, not an architecture choice). The sim never reads a `visual`; a
 * headless server loads the same defs and ignores it entirely. This is the seam that makes art a
 * per-item, any-time decision instead of a migration phase:
 *
 *   prototype day:  visual: { kind: 'auto' }                             — placeholder, zero art decisions
 *   feel day:       visual: { kind: 'procedural', draw: 'greatHelm' }    — a tuned procedural silhouette
 *   art day:        visual: { kind: 'sprite', art: '…png', scale: 1.6 }  — hand-crafted texture, one data edit
 *
 * Renderers keep one strategy per kind (see systems/AccessorySystem); flipping a def's kind never touches
 * sim data (reach/slots/modifiers stay sibling fields) so a substrate swap can't change gameplay.
 */
export type Visual =
  /** Auto-generated placeholder (a hash-colored disc) — for prototyping mechanics before ANY art exists. */
  | { kind: 'auto' }
  /** Procedural draw: `draw` keys into the render site's draw registry (e.g. draw/accessoryDraws). */
  | { kind: 'procedural'; draw: string; color?: number }
  /** Hand-crafted texture. `art` is a path under src/art; display size = body diameter × `scale`. */
  | { kind: 'sprite'; art: string; scale: number };

/** Shared def-validator fragment (fail loud at boot). A procedural `draw` KEY's EXISTENCE is checked by the
 *  boot sweep instead (the registry lives presentation-side; defs stay importable headless). */
export function visualProblem(v: Visual | undefined): string | null {
  if (!v) return 'visual is required';
  if (v.kind === 'sprite') {
    if (!v.art) return 'sprite visual needs an art path';
    if (!(v.scale > 0)) return `sprite visual scale must be > 0 (got ${v.scale})`;
  }
  if (v.kind === 'procedural' && !v.draw) return 'procedural visual needs a draw key';
  return null;
}
