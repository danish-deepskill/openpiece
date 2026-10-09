import { modifierProblem, type Modifier } from '../combat/Modifier';
import { Registry, type Def } from '../core/Registry';
import { visualProblem, type Visual } from './visual';

/** Where an accessory sits on the body. Add a slot here to support a new wear location; each slot gets an
 *  anchor + depth in AccessorySystem (derived from draw/actorDraws.ANATOMY, the shared body contract).
 *  `chest` = the torso/shoulder armor canvas — author its sprites with a transparent head cutout at the
 *  head anchor (top-down: your head occludes your chest, and it renders ABOVE the chest layer).
 *  `hair` = on the head, ABOVE the bare head/face but BELOW the head(hat) slot — so a hat covers hair, and
 *  a hair sprite + a hat can be worn together (they occupy distinct slots). Author on the head canvas. */
export type AccessorySlot = 'head' | 'hair' | 'face' | 'back' | 'chest';

/**
 * A wearable cosmetic. Content is data: the look is a `Visual` descriptor (auto placeholder / procedural
 * draw / hand-crafted sprite — see defs/visual.ts), so prototyping needs zero art and "getting real art"
 * is a per-item data flip, never a migration. Sprite art paths resolve in BootScene (presentation); defs
 * stay JSON-serializable and loadable on a headless server (which needs slots/modifiers/tags for combat,
 * never the pixels). Accessories may also carry `modifiers`/`tags` (e.g. a helmet granting +def).
 */
export interface AccessoryDef extends Def {
  name: string;
  slot: AccessorySlot;
  /** The look — substrate is data. Placement (offset/rotates/layer) stays HERE: it applies to any kind. */
  visual: Visual;
  /** Forward offset along the aim direction, in px (e.g. nudge a hat brim forward). Default 0. */
  offset?: number;
  /** Rotate to face the aim direction (a sprite's "forward" is up). Default true. */
  rotates?: boolean;
  /** WHAT it turns with: 'aim' (default) = the cursor/facing, right for a hat; 'body' = the torso's live orientation,
   *  which TWISTS through a swing (draw/actorDraws.bodyDrawAngle) — right for anything mounted ON the body (shoulder
   *  armor, a cape), else the piece stands still while the shoulders under it turn. */
  follows?: 'aim' | 'body';
  /** Drawn over the body (hat) or under it (cape/back-item). Default 'over'. */
  layer?: 'over' | 'under';
  /** Colors a PROCEDURAL draw reads (`base` = the material, `trim` = rim/crest/fittings) — so one draw fn serves a
   *  family of looks (the Samurai's indigo sode, the Ronin's crimson one) without a draw key per color. A draw
   *  falls back to its own defaults when unset; a sprite ignores it (its colors are in the art). */
  palette?: { base: number; trim: number };
  modifiers?: Modifier[];
  tags?: string[];
}

// validated at boot: a bad visual renders an invisible accessory — a content bug, not a style choice
export const Accessories = new Registry<AccessoryDef>('Accessories', (a) => {
  return visualProblem(a.visual) ?? modifierProblem(a.modifiers);
});

Accessories.registerAll([
  // the hero's icon — FOUND in the cutlass house (WorldGen loot), not spawn-worn (id grammar: accessory.<camelCase>)
  { id: 'accessory.strawHat', name: 'Straw Hat', slot: 'head', visual: { kind: 'sprite', art: 'accessories/examples/straw_hat.png', scale: 1.6 } },
  // the samurai's KASA — the first PROCEDURAL accessory (draw/accessoryDraws.kasa): no art day needed for a cone of
  // straw. Turns with the aim like every hat (its ribs show the turn). A sprite flip later is one data edit.
  { id: 'accessory.kasa', name: 'Kasa', slot: 'head', visual: { kind: 'procedural', draw: 'kasa' } },
  // the samurai's SODE (shoulder guards) — a VISUAL chest piece, no modifiers: armor-with-stats is backlog #4's
  // call. follows:'body' — the plates ride the torso's LIVE orientation, which twists through a swing, so they
  // stay on the shoulders mid-cut instead of standing still while the shoulders turn under them.
  { id: 'accessory.sode', name: 'Sode', slot: 'chest', visual: { kind: 'procedural', draw: 'sode' }, follows: 'body' },
  // the RONIN's KABUTO — a lacquered war helmet (draw/accessoryDraws.kabuto): the bowl, the flaring neck guard behind,
  // the golden crescent crest forward. Turns with the aim like every helm (the crest shows the turn). Black lacquer +
  // gold, to read against the Samurai's straw at a glance.
  { id: 'accessory.kabuto', name: 'Kabuto', slot: 'head', visual: { kind: 'procedural', draw: 'kabuto' }, palette: { base: 0x1b1518, trim: 0xd4af37 } },
  // the RONIN's SODE — the same shoulder-guard draw in his colors (crimson lacquer, gold rim): the palette knob, not a
  // second draw. Matches the red blade and the crimson garb; the Samurai keeps indigo + brass.
  { id: 'accessory.sodeRonin', name: 'Crimson Sode', slot: 'chest', visual: { kind: 'procedural', draw: 'sode' }, follows: 'body', palette: { base: 0x5a1418, trim: 0xd4af37 } },
  // ZORO's look (docs/references/characters/zoro.png) — three palette-driven procedural pieces, one per slot:
  // the GREEN SPIKES (hair slot: the top-down read — a jagged crown over the head, under any hat), the CRIMSON SASH
  // (chest, body-follow: a band across the waist of the dark green coat, knotted at his left), THREE GOLD EARRINGS
  // (face slot: three drops trailing off his left ear — the detail that says Zoro at a glance).
  { id: 'accessory.hairZoro', name: 'Green Spikes', slot: 'hair', visual: { kind: 'procedural', draw: 'spikyHair' }, palette: { base: 0x8fd36a, trim: 0x4f8a3a } },
  { id: 'accessory.sashZoro', name: 'Crimson Sash', slot: 'chest', visual: { kind: 'procedural', draw: 'sash' }, follows: 'body', palette: { base: 0xa0233a, trim: 0x5a1020 } },
  { id: 'accessory.earringsZoro', name: 'Three Earrings', slot: 'face', visual: { kind: 'procedural', draw: 'earrings' }, palette: { base: 0xe0b23a, trim: 0x8a6a1a } },
  // the Brawler's helmet (the D- sword duelist) — the plain grey visor
  { id: 'accessory.soldierHelmet', name: 'Soldier Helmet', slot: 'head', visual: { kind: 'sprite', art: 'hats/soldier_helmet.png', scale: 1.6 } },
  // the Brute's helmet — the horned one, marks the F+ fodder variant at a glance
  { id: 'accessory.bruteHelmet', name: 'Brute Helmet', slot: 'head', visual: { kind: 'sprite', art: 'hats/brute_helmet.png', scale: 1.6 } },
  // the Bandit's hat — pairs with the dagger (light-class kit)
  { id: 'accessory.banditHat', name: 'Bandit Hat', slot: 'head', visual: { kind: 'sprite', art: 'accessories/examples/bandit_hat.png', scale: 1.6 } },
  // the Marine officer's cap — white dome + blue/yellow band (naval livery), gold side buttons
  //   (replaced the old Ranger helmet when the unit became the Marine Officer)
  { id: 'accessory.marineOfficerHat', name: 'Marine Officer Hat', slot: 'head', visual: { kind: 'sprite', art: 'hats/marine_officer_hat.png', scale: 1.6 } },
  // FIRST chest/apparel sprite — a body-frame garment over the torso (AI-gen, processed via tools/asset-pipeline).
  // Author on docs/art/apparel-template: draw the garment across the body shape; the head cutout is punched by
  // the pipeline (--slot chest). scale 1 = the body frame's native ±1.5r canvas.
  { id: 'accessory.kaidoArmor', name: 'Beast Armor', slot: 'chest', visual: { kind: 'sprite', art: 'apparel/kaido_armor.png', scale: 1, frame: 'body' } },
]);
