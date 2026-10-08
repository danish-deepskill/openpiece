import Phaser from 'phaser';
import { Abilities } from '../combat/Ability';
import { Effects } from '../combat/Effect';

/**
 * GENERATED (procedural) projectile textures — a ball drawn from code, no PNG. Baked ONCE at boot:
 *  - the PLAIN lead ball, and
 *  - one CHARGED variant per distinct proc-effect THEME COLOR found in content (an ability's procEffect →
 *    its effect row's status.color) — so an electric round crackles cyan and a future fire round bakes its
 *    own ember variant with ZERO code here (the color is content, scanned from the defs).
 * ProjectileRenderer pins a sprite to the right key. Presentation-only: the sim carries `shotProc: 'ball'`
 * + the projectile's proc payload — the look lives here. A texture (not a per-frame Graphics redraw) keeps
 * the render path a cheap sprite blit.
 */

/** Native canvas the ball is baked at — big enough for a crisp ball + the charged glow ring; the renderer
 *  scales it down to the ability's `shotSize`. */
const TEX = 64;

/** Texture key for a proc projectile: kind + (charged theme color) IS the key — derived, no registry. */
export const shotProcKey = (kind: string, color?: number): string =>
  color === undefined ? `shotproc:${kind}` : `shotproc:${kind}:${color.toString(16)}`;

/** Bake every proc-projectile texture into the scene's texture manager: the plain ball + a charged variant per
 *  distinct proc color in the ability defs. Idempotent (skips baked keys — a scene restart won't re-register).
 *  Call in a scene `create()` (needs the live renderer/context). */
export function bakeProjectileTextures(scene: Phaser.Scene): void {
  ball(scene, undefined); // plain lead round
  const colors = new Set<number>();
  for (const a of Abilities.all()) {
    const proc = a.shape?.procEffect;
    if (!proc) continue;
    colors.add(Effects.get(proc.effect).status?.color ?? 0xffffff); // the effect row's ONE theme color
  }
  for (const c of colors) ball(scene, c);
  slash(scene); // the flying wind crescent (shotProc 'slash')
}

/** A WIND SLASH: a crescent flying along +x (the renderer rotates it to the heading) — a thick pale blade-arc
 *  with its bulge leading and a thin inner echo, so it reads as a cut in the air, not a ball. */
function slash(scene: Phaser.Scene): void {
  const key = shotProcKey('slash');
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = TEX / 2;
  const r = TEX * 0.42;
  const cx = c - TEX * 0.14; // the arc's center sits BEHIND the canvas center so its bulge leads at +x
  g.lineStyle(9, 0xeef6ff, 0.95);
  g.beginPath();
  g.arc(cx, c, r, -1.15, 1.15, false);
  g.strokePath();
  g.lineStyle(3, 0x9fd8ff, 0.9); // the inner echo
  g.beginPath();
  g.arc(cx, c, r * 0.72, -0.95, 0.95, false);
  g.strokePath();
  g.generateTexture(key, TEX, TEX);
  g.destroy();
}

/** A round shot. Plain = dark lead with a hot highlight. Charged = a bright themed core, white-hot center, and
 *  a jagged crackle ring so a proc'd round reads DIFFERENT at a glance (you can see the charge coming). */
function ball(scene: Phaser.Scene, color: number | undefined): void {
  const key = shotProcKey('ball', color);
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = TEX / 2;
  const r = TEX * 0.28; // the solid ball radius (leaves canvas margin for the charged glow/crackle)

  if (color !== undefined) {
    // outer glow → themed core → white-hot center: a charged look, colored by the effect's theme
    g.fillStyle(color, 0.35);
    g.fillCircle(c, c, r * 1.7);
    g.fillStyle(color, 1);
    g.fillCircle(c, c, r);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c, c, r * 0.5);
    // a jagged crackle ring — a few spokes of arc so it reads as CHARGED, not just a tinted ball
    g.lineStyle(2, 0xffffff, 0.9);
    const spokes = 6;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const a2 = a + 0.5;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r * 1.1, c + Math.sin(a) * r * 1.1);
      g.lineTo(c + Math.cos(a2) * r * 1.55, c + Math.sin(a2) * r * 1.55); // a kinked bolt outward
      g.strokePath();
    }
  } else {
    g.fillStyle(0x1a1a1a, 1); // dark lead
    g.fillCircle(c, c, r);
    g.fillStyle(0x6b6b6b, 1); // a top-left highlight for a bit of round volume
    g.fillCircle(c - r * 0.3, c - r * 0.3, r * 0.4);
  }

  g.generateTexture(key, TEX, TEX);
  g.destroy();
}
