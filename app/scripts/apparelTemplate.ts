/**
 * Generates the APPAREL AUTHORING TEMPLATES from the live anatomy contract — `npm run art:apparel`.
 * The plain body silhouette (facing UP) — NOTHING else. It is the bare shape you draw a chest/apparel sprite
 * on top of. No rings, text, head, cutout or registration marks: just the body.
 *
 * SHAPE VARIANTS, computed from the SAME exported constants the renderer uses so they can't drift from the
 * game body:
 *   - `apparel-template.svg`         — ELLIPSE body: torso + 2 shoulder ellipses (the OLD drawActor look).
 *   - `apparel-template-blocky.svg`  — ONE rounded-rect torso from the LIVE `BLOCKY` knobs (`draw/actorDraws`),
 *                                      i.e. exactly the in-game blocky body's torso, with the game outline.
 *                                      This is the shape to hand an AI to draw apparel against.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANATOMY, BLOCKY, BODY_FRAME_R } from '../src/draw/actorDraws';

const SIZE = 512; // px — the reference canvas the artist duplicates (any square multiple works)
const C = SIZE / 2;
const R = SIZE / (2 * BODY_FRAME_R); // body collision radius in template px

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const OUTLINE = hex(0x4d4a45);
const GARB = hex(0x6b4a3a); // the body silhouette fill (neutral placeholder garb, as in-game)

// OUTLINE WIDTH — match the GAME's LOOK, not a flat 2px. The game strokes 2px on a body of radius r=11
// (bodies.ts) = 2/11 of the radius; at this big template (R≈171px) the same proportion is ≈31px, else the
// outline renders as a faint hairline (~15× too thin). See scripts/blockyTemplate.ts for the same derivation.
const GAME_R = 11; // body.humanoid r (bodies.ts)
const STROKE = ((2 / GAME_R) * R).toFixed(1); // ≈31px at R=171 — the game's outline proportion

// facing UP: forward f (×r) → −y; sideways s (×r) → +x
const px = (s: number): number => C + s * R;
const py = (f: number): number => C - f * R;

const A = ANATOMY;

const doc = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">\n` +
  `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="#2e3630"/>\n${body}\n</svg>\n`; // bg keeps the outline readable

/** OLD oval body: torso ellipse + 2 shoulder ellipses (ANATOMY, facing UP). */
function ellipseBody(): string {
  const ell = (f: number, s: number, hl: number, ha: number): string =>
    `<ellipse cx="${px(s)}" cy="${py(f)}" rx="${ha * R}" ry="${hl * R}" fill="${GARB}" stroke="${OUTLINE}" stroke-width="${STROKE}"/>`;
  const parts = [ell(A.torsoFwd, 0, A.torsoHalfL, A.torsoHalfW)];
  for (const s of [-1, 1] as const) parts.push(ell(A.shoulderFwd, s * A.shoulderOut, A.shoulderHalfL, A.shoulderHalfW));
  return parts.join('\n');
}

/** BLOCKY body: ONE rounded-rect torso, dead-center, from the LIVE `BLOCKY` knobs — exactly what the game
 *  draws (drawActorBlocky). This is the shape to hand an AI to draw apparel against. */
function blockyBody(): string {
  const w = BLOCKY.torsoHalfW * 2 * R; // across facing
  const h = BLOCKY.torsoHalfL * 2 * R; // along facing
  const rad = Math.min(w, h) * BLOCKY.corner; // corner is a fraction of the short side (matches drawActorBlocky)
  return `<rect x="${C - w / 2}" y="${C - h / 2}" width="${w}" height="${h}" rx="${rad}" ry="${rad}" fill="${GARB}" stroke="${OUTLINE}" stroke-width="${STROKE}"/>`;
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'docs', 'art');
mkdirSync(outDir, { recursive: true });

const variants: Array<[string, string]> = [
  ['apparel-template.svg', doc(ellipseBody())], // ELLIPSE — the old oval body
  ['apparel-template-blocky.svg', doc(blockyBody())], // BLOCKY — the live in-game blocky torso (for AI handoff)
];
for (const [name, svg] of variants) {
  const out = join(outDir, name);
  writeFileSync(out, svg);
  console.log(`wrote ${out}`);
}
console.log(`(r = ${R.toFixed(1)}px on a ${SIZE}px canvas)`);
