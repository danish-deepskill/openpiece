import { clamp } from '../core/math';
import { ShipHulls } from '../defs/ships';
import type { DrawFn } from '../ecs/components';

type P = { x: number; y: number };

/**
 * Oriented ship hull (bow at +x in LOCAL space; RenderSystem rotates the Graphics to the heading).
 * Procedural polygons only — fillPoints / fillTriangle / fillCircle (no quadraticCurveTo).
 */
export const drawShip: DrawFn = (g, e) => {
  const rd = e.render!;
  const sh = e.ship!;
  const d = ShipHulls.get(sh.hull);
  const L = d.length / 2;
  const W = d.width / 2;

  const hull: P[] = [
    { x: L, y: 0 },
    { x: L * 0.45, y: -W },
    { x: -L * 0.72, y: -W * 0.86 },
    { x: -L, y: 0 },
    { x: -L * 0.72, y: W * 0.86 },
    { x: L * 0.45, y: W },
  ];
  const deck: P[] = [
    { x: L * 0.78, y: 0 },
    { x: L * 0.35, y: -W * 0.7 },
    { x: -L * 0.6, y: -W * 0.66 },
    { x: -L * 0.78, y: 0 },
    { x: -L * 0.6, y: W * 0.66 },
    { x: L * 0.35, y: W * 0.7 },
  ];

  // water shadow
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 5, L * 1.95, W * 1.9);

  // hull + outline
  g.fillStyle(rd.baseColor, 1);
  g.fillPoints(hull, true);
  g.lineStyle(3, 0x3a2410, 0.95);
  g.strokePoints(hull, true);

  // deck
  g.fillStyle(0xcaa06a, 1);
  g.fillPoints(deck, true);

  // mast + sail (billows toward the bow with speed)
  const bulge = clamp(sh.speed / d.maxSpeed, -1, 1) * W * 0.5;
  g.fillStyle(0xf3e7c9, 1);
  g.fillTriangle(L * 0.08, -W * 0.66, L * 0.08, W * 0.66, L * 0.08 + 16 + bulge, 0);
  g.lineStyle(2, 0xd8c79a, 1);
  g.strokeTriangle(L * 0.08, -W * 0.66, L * 0.08, W * 0.66, L * 0.08 + 16 + bulge, 0);
  g.fillStyle(0x5a3a1c, 1);
  g.fillCircle(L * 0.08, 0, 3);

  // bow flag (marks heading)
  g.fillStyle(0xd4483b, 1);
  g.fillTriangle(L * 0.92, -3, L * 0.92, -15, L * 0.78, -9);

  // anchored: a small chain dot off the stern
  if (sh.anchored) {
    g.fillStyle(0x2b2b33, 0.9);
    g.fillCircle(-L, 0, 3);
  }
};
