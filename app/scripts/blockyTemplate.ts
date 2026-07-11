/**
 * Generates the BLOCKY FULL-UNIT TEMPLATE (docs/art/unit-template-blocky.svg) — `npm run art:blocky`.
 * A true-top-down (Roblox-ish) unit: ONE rounded-rect torso, concentric circle head + circle fists.
 *
 * THIS SCRIPT OWNS NO NUMBERS. The shape knobs live in ONE place — `BLOCKY` in src/draw/actorDraws.ts —
 * which the in-game draw (`actorBlocky`) reads too. Tune there → the game updates (vite reload) AND this
 * template regenerates to match. Deciding "this template is the one" = the BLOCKY numbers + flipping
 * `body.humanoid.draw` to 'actorBlocky' (defs/bodies.ts). Head size and fist size come from the shared
 * contracts (ANATOMY.headR, HAND_R_FRAC) because hands are combat/animation-owned, not style-owned.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANATOMY, BLOCKY, BODY_FRAME_R } from '../src/draw/actorDraws';
import { HAND_R_FRAC } from '../src/combat/swing';

const SIZE = 512;
const C = SIZE / 2;
const R = SIZE / (2 * BODY_FRAME_R); // body radius r in template px

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const OUTLINE = hex(0x4d4a45);
const GARB = hex(0x6b4a3a);
const SKIN = hex(0xe0a070);

// PREVIEW-ONLY knob: outline thickness multiplier. The game strokes 2px on r=11 (bodies.ts) = 2/11 of the
// radius; this template matches that RATIO at its big scale so the sheet looks like the game. 1.0 = game.
const OUTLINE_MULT = 1.0;
const STROKE = ((2 / 11) * R * OUTLINE_MULT).toFixed(1);

// facing UP: forward f (×r) → −y; sideways s (×r) → +x
const px = (s: number): number => C + s * R;
const py = (f: number): number => C - f * R;

const parts: string[] = [];
parts.push(`<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="#2e3630"/>`); // bg keeps the outline readable

// fists FIRST (behind the torso) — at the BLOCKY idle rest spot, sized by the shared combat contract
for (const s of [-1, 1] as const) {
  parts.push(`<circle cx="${px(s * BLOCKY.armOut)}" cy="${py(BLOCKY.armFwd)}" r="${HAND_R_FRAC * R}" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="${STROKE}"/>`);
}

// THE TORSO — one rounded rectangle, dead center (true top-down; exactly what actorBlocky paints)
const halfW = BLOCKY.torsoHalfW * R; // across facing (x on this facing-up sheet)
const halfH = BLOCKY.torsoHalfL * R; // along facing (y)
const cornerR = Math.min(halfW, halfH) * 2 * BLOCKY.corner;
parts.push(`<rect x="${C - halfW}" y="${C - halfH}" width="${halfW * 2}" height="${halfH * 2}" rx="${cornerR}" ry="${cornerR}" fill="${GARB}" stroke="${OUTLINE}" stroke-width="${STROKE}"/>`);

// head — concentric on top (no headBack cheat in the blocky style)
parts.push(`<circle cx="${C}" cy="${C}" r="${ANATOMY.headR * R}" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="${STROKE}"/>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">\n${parts.join('\n')}\n</svg>\n`;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'docs', 'art');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'unit-template-blocky.svg');
writeFileSync(out, svg);
console.log(`wrote ${out} (r = ${R.toFixed(1)}px; knobs: BLOCKY in src/draw/actorDraws.ts)`);
