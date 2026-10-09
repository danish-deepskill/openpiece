import type { Entity } from '../ecs/components';
import { TAG_ARMAMENT } from './Effect';

/**
 * FX THEME — how a body's attack visuals look, derived from the body's STATE, never authored per ability. A coated
 * swordsman's every cut, the crescent he looses, the spark where he lands, the blade in his hand all read as haki
 * because the TAG is on him — not because each row says so (that was the hardcoded version, and it missed everything
 * but the one row that carried the flag). The sim emits only the theme's NAME on its FX events / stamps it on a shot at
 * fire time; presentation owns the colors (draw/fxThemes). Adding a themed state (a Logia's flame form, a frost
 * coating) is one row here + one palette row there.
 */
export type FxTheme = 'haki';

/** Body tags that re-theme the body's attack visuals — the first present wins (a coating over a lesser state). */
export const FX_THEME_BY_TAG: readonly { tag: string; theme: FxTheme }[] = Object.freeze([{ tag: TAG_ARMAMENT, theme: 'haki' }]);

/** The theme `e`'s attack visuals carry right now, or undefined for plain steel. */
export function fxThemeOf(e: Entity): FxTheme | undefined {
  const tags = e.tags;
  if (!tags) return undefined;
  for (const row of FX_THEME_BY_TAG) if (tags.has(row.tag)) return row.theme;
  return undefined;
}
