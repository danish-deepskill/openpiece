import type Phaser from 'phaser';
import { Abilities } from '../combat/Ability';
import { HAND_R_FRAC, activeSide, guardHand, restHand, swingGeomOf, swingPose } from '../combat/swing';
import { clamp } from '../core/math';
import type { AccessorySlot } from '../defs/accessories';
import { Weapons, type WeaponVisual } from '../defs/layers';
import type { Entity } from '../ecs/components';

/** The procedurally-drawn weapon kinds — 'sprite' visuals render via WeaponSpriteSystem instead. */
type ProceduralWeaponVisual = Exclude<WeaponVisual, { kind: 'sprite' }>;

/** A procedural draw function: paint the entity into its Graphics in LOCAL space (presentation-owned). */
export type DrawFn = (g: Phaser.GameObjects.Graphics, e: Entity) => void;

const OUTLINE = 0x4d4a45; // charcoal gray (lighter than near-black), 1px solid on body + hands
const HP_BAR_COLOR = 0x5ec85e; // green; health reads the same for everyone — friend/foe is the NAME color, not the bar

/**
 * Humanoid anatomy proportions (× body radius r) — the SINGLE contract between the procedural body
 * (drawActor), accessory anchoring (AccessorySystem's slot anchors), and future wearable-sprite authoring.
 * Everything drawn or pinned on a body derives from THESE numbers, so paint and sprites can't drift apart.
 * Budget (locked by anatomy.test): widest extent ≤ 1.2·r and the head stays inside the collision circle —
 * the silhouette must not lie about the circle players actually fight (the hitbox IS just r).
 */
/** Orientation model (the developer's call): the TOP-DOWN PERSPECTIVE CHEAT — you see a unit's FRONT as it
 *  walks toward you. So the head sits AWAY from facing (top of the figure on a south-facing unit) and the
 *  torso crescent / shoulder slabs / resting arms show on the FACING side. The base sketch IS the
 *  south-facing pose. */
export const ANATOMY = {
  headR: 0.72, // head radius — the hat/face canvas
  headBack: 0.12, // head center AWAY from the AIM. The head does NOT twist with swings (hats track aim only)
  torsoFwd: 0.3, // torso center TOWARD facing — makes the crescent peeking out on the facing side
  torsoHalfL: 0.62, // torso semi-axis along facing
  torsoHalfW: 0.72, // torso semi-axis across facing — narrow: the crescent peeks out FRONT, shoulders own the sides
  shoulderOut: 0.86, // shoulder-slab center sideways — with shoulderHalfW this is the widest point (1.08·r)
  shoulderFwd: 0.08, // shoulder-slab center toward facing
  shoulderHalfW: 0.22, // slab semi-axis across facing — tall slabs flanking the head (the pauldron mounts)
  shoulderHalfL: 0.42, // slab semi-axis along facing
  armW: 0.3, // sleeve (upper-arm) thickness, shoulder → fist — keeps the hitbox-sized fist proportionate
} as const;

/** Each slot's anchor along the AIM axis (×r) — where an 'item'-frame accessory pins. Lives HERE beside
 *  ANATOMY (its source) so the renderer (AccessorySystem) and the artist template (scripts/unitTemplate)
 *  read ONE object and can never disagree about where a hat sits. */
export const SLOT_ANCHOR: Record<AccessorySlot, number> = {
  head: -ANATOMY.headBack,
  face: -ANATOMY.headBack + ANATOMY.headR * 0.55, // the facing half of the head
  chest: ANATOMY.torsoFwd,
  back: -(ANATOMY.headBack + ANATOMY.headR * 0.5), // away from facing, over the head's far half (capes)
};

/** The registered AUTHORING frame half-extent (×r): a `frame: 'body'` sprite's square canvas spans ±this
 *  around the body center, forward = up. Artists draw wearables directly on the generated template
 *  (docs/art/unit-template.svg — `npm run art:template`), so fit is by construction, not by math.
 *  Covers the full silhouette (1.12·r) with margin for capes/brims (anatomy.test locks the coverage). */
export const BODY_FRAME_R = 1.5;

/** Darken an 0xRRGGBB color (×f per channel) — the garb fallback for a body def without an explicit `garb`. */
function darken(c: number, f = 0.72): number {
  const ch = (x: number): number => Math.floor(x * f);
  return (ch((c >> 16) & 0xff) << 16) | (ch((c >> 8) & 0xff) << 8) | ch(c & 0xff);
}

/** A held weapon, drawn from the hand outward along the aim angle `a` (LOCAL space). `kind` picks the look:
 *  a plain 'blade' (line + rounded tip), a 'dagger' (grip + crossguard + tapered point), or a 'club'. */
function drawWeapon(g: Phaser.GameObjects.Graphics, hx: number, hy: number, a: number, v: ProceduralWeaponVisual): void {
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  const px = -Math.sin(a); // perpendicular to the aim
  const py = Math.cos(a);
  const L = v.length;
  const W = v.width;
  const ex = hx + fx * L;
  const ey = hy + fy * L;

  if (v.kind === 'dagger') {
    // grip (hand → guard) · crossguard · steel blade tapering to a point (guard → tip)
    const gf = 0.32; // grip length as a fraction of L; the guard sits at its end
    const gx = hx + fx * L * gf;
    const gy = hy + fy * L * gf;
    g.lineStyle(W + 3, OUTLINE, 1); // wooden grip
    g.lineBetween(hx, hy, gx, gy);
    g.lineStyle(W * 0.95, 0x7d5230, 1);
    g.lineBetween(hx, hy, gx, gy);
    const bw = W * 0.85; // blade half-width at the guard
    const tri = (pad: number): void => {
      g.beginPath();
      g.moveTo(gx + px * (bw + pad), gy + py * (bw + pad));
      g.lineTo(ex + fx * pad, ey + fy * pad);
      g.lineTo(gx - px * (bw + pad), gy - py * (bw + pad));
      g.closePath();
      g.fillPath();
    };
    g.fillStyle(OUTLINE, 1);
    tri(2); // outline silhouette
    g.fillStyle(v.color, 1);
    tri(0); // steel
    g.lineStyle(1, 0xe6e9ee, 0.5); // faint center ridge
    g.lineBetween(gx, gy, ex, ey);
    const gw = W * 1.5; // crossguard half-length
    g.lineStyle(W * 0.55 + 3, OUTLINE, 1);
    g.lineBetween(gx + px * gw, gy + py * gw, gx - px * gw, gy - py * gw);
    g.lineStyle(W * 0.55, 0xa9adb5, 1);
    g.lineBetween(gx + px * gw, gy + py * gw, gx - px * gw, gy - py * gw);
    g.fillStyle(OUTLINE, 1); // pommel nub in the fist
    g.fillCircle(hx, hy, W * 0.7 + 1.5);
    g.fillStyle(0x7d5230, 1);
    g.fillCircle(hx, hy, W * 0.7);
    return;
  }

  if (v.kind === 'club') {
    g.lineStyle(W + 3, OUTLINE, 0.95);
    g.lineBetween(hx, hy, ex, ey);
    g.lineStyle(W, 0x6b4a2a, 1);
    g.lineBetween(hx, hy, ex, ey);
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(ex, ey, W * 1.1 + 2);
    g.fillStyle(v.color, 1);
    g.fillCircle(ex, ey, W * 1.1);
    return;
  }

  // 'blade' (cutlass) — the original simple look, unchanged
  g.lineStyle(W + 3, OUTLINE, 0.95);
  g.lineBetween(hx, hy, ex, ey);
  g.lineStyle(W, v.color, 1);
  g.lineBetween(hx, hy, ex, ey);
  g.fillStyle(v.color, 1);
  g.fillCircle(ex, ey, W * 0.6);
  g.fillStyle(0x6b4a2a, 1); // wooden grip
  g.fillCircle(hx, hy, W * 0.7);
}

/** A skin-toned foot — an oval sole + an ankle ball — centered at (cx,cy), oriented along `ang`. Shared by the
 *  side-kick and the stretching Gomu Stamp (so the rubber kick reads as a leg + foot, not an arm + fist). */
function drawFoot(g: Phaser.GameObjects.Graphics, cx: number, cy: number, ang: number, handR: number, c: number, side: number): void {
  const Tx = handR * 1; // sole thickness (along the kick) — short axis
  const Ly = handR * 2; // sole length (across the kick) — long axis
  const ankleR = handR * 0.6;
  const ax = -handR * 0.45; // ankle pokes back toward the leg
  const ay = -handR * 0.3 * (side || 1); // ...a bit to one side (mirrors L/R)
  g.save();
  g.translateCanvas(cx, cy);
  g.rotateCanvas(ang);
  g.fillStyle(OUTLINE, 1); // one unified charcoal silhouette
  g.fillEllipse(0, 0, Tx + 4, Ly + 4);
  g.fillCircle(ax, ay, ankleR + 2);
  g.fillStyle(c, 1); // skin on top (a ~2px outline border remains)
  g.fillEllipse(0, 0, Tx, Ly);
  g.fillCircle(ax, ay, ankleR);
  g.restore();
}

/** A Gomu rubber limb — the thick outlined tube from root→tip, PLUS an outlined half-circle cap that closes the
 *  ROOT end (the base at the shoulder/hip). Without it the tube ends in a bare, borderless edge where it meets
 *  the body; the cap rounds+outlines only the exposed half (the side facing away from the tip). The caller draws
 *  the tip (a fist or a foot). Shared by Pistol/Gatling/Rocket (arm) and the Gomu Stamp (leg). */
function drawStretchLimb(g: Phaser.GameObjects.Graphics, ax: number, ay: number, bx: number, by: number, handR: number, c: number): void {
  const w = handR * 1.7; // tube thickness
  // Built exactly like the tube itself — an OUTLINE silhouette, then the COLOR fill on top — so the 2px border
  // is uniform. A round knob at the root (matching each pass's radius) closes the bare end: its outer half shows
  // as a clean half-circle outline flush with the tube edges, its inner half is covered by the tube.
  g.lineStyle(w + 4, OUTLINE, 1); // outline pass: tube…
  g.lineBetween(ax, ay, bx, by);
  g.fillStyle(OUTLINE, 1); // …+ rounded root cap, same width as the outlined tube
  g.fillCircle(ax, ay, (w + 4) / 2);
  g.lineStyle(w, c, 1); // color pass: rubber tube…
  g.lineBetween(ax, ay, bx, by);
  g.fillStyle(c, 1); // …+ the cap fill, leaving a uniform 2px outline all around
  g.fillCircle(ax, ay, w / 2);
}

/**
 * World-space grip anchor + angle of the HELD weapon: the acting hand's swing pose mid-attack, the lead
 * rest hand otherwise; undefined while a rubber ARM replaces the hand (Gomu stretch — the weapon reads as
 * stowed). ONE home for this math — drawActor (procedural weapons) and WeaponSpriteSystem (sprite weapons)
 * both call it, so the drawn grip can never drift between the two substrates.
 */
export function weaponAnchor(e: Entity): { x: number; y: number; angle: number } | undefined {
  const t = e.transform;
  if (!t) return undefined;
  const m = e.melee;
  const shape = m ? Abilities.get(m.ability).shape : undefined;
  if (m && shape && m.motion === 'stretch' && shape.limb !== 'foot') return undefined; // rubber arms out — weapon stowed
  const pose = m && shape ? swingPose(m, shape, swingGeomOf(e)) : undefined;
  const drawA = pose ? pose.drawAngle : t.angle;
  if (pose && shape!.limb !== 'foot') return { x: t.x + pose.hx, y: t.y + pose.hy, angle: drawA }; // swinging: the acting hand (`!` safe: pose exists only when shape did)
  const [hx, hy] = restHand(drawA, 1, t.r); // idle (or kicking): held at the lead rest hand
  return { x: t.x + hx, y: t.y + hy, angle: drawA };
}

/**
 * Shared humanoid actor: a garb-colored torso + shoulder nubs (they twist with swings) under a skin-toned
 * head that stays on the aim, two hands behind the body (one sweeps/lunges on attack), and — if armed —
 * the weapon held in the lead hand. All proportions come from ANATOMY (the shared anchor contract).
 * Hats/armor sprites are overlaid separately by AccessorySystem; nameplates by NameplateSystem.
 */
export const drawActor: DrawFn = (g, e) => {
  const t = e.transform!;
  const rd = e.render!;
  const r = t.r;
  const a = t.angle;
  const flashing = !!e.health && e.health.hitFlash > 0;

  // contact shadow — sized to the shoulder-wide anatomy, not just the head
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(0, r * 0.7, r * 2.1, r * 0.95);

  // Logia intangibility aura
  if (e.tags?.has('state.logia.intangible')) {
    g.fillStyle(0x9fd0ff, 0.22);
    g.fillCircle(0, 0, r * 1.35);
  }

  // hands FIRST — drawn behind the body so the body/head sits on top (only the outer nubs peek past the rim).
  // Mid-swing the WHOLE body orients to the swing's drawAngle (an arc twists it left→across→back); the acting
  // hand follows the shared swing pose, so the drawn fist/blade IS the hitbox.
  const handR = r * HAND_R_FRAC; // shared with the hitbox (combat/swing) — what you see is what hits
  const wid = e.equipment?.weapon;
  const wDef = wid ? Weapons.get(wid) : undefined;
  const wv = wDef?.visual;
  const m = e.melee;
  const shape = m ? Abilities.get(m.ability).shape : undefined; // the swing TYPE's params (data) drive the pose
  const pose = m && shape ? swingPose(m, shape, swingGeomOf(e)) : undefined;
  const drawA = pose ? pose.drawAngle : a;
  // foot attacks never use the hands — both stay at rest. A plain kick emerges a foot; a STRETCH-foot (Gomu
  // Stamp) stretches a LEG from the hip to a far foot. Only HAND attacks consume a hand (the rubber arm).
  const footLimb = shape?.limb === 'foot';
  const footKick = !!pose && footLimb && m!.motion !== 'stretch';
  const footStretch = !!pose && footLimb && m!.motion === 'stretch';
  const actSide = pose && !footLimb && shape ? activeSide(m!, shape.jabs ?? 1) : 0; // which HAND throws (flurry alternates)
  // anatomy + garb (clothing color, the second channel chest armor will later cover) — used by the sleeves
  // in the hand loop below AND the torso/shoulder block after it
  const A = ANATOMY;
  const garb = flashing ? 0xffffff : rd.garbColor ?? darken(rd.baseColor);

  // held weapon FIRST — under every fist and under the body: the gripping hand(s) cover the hilt, the body
  // covers the inner span, and the blade reads where it extends past the silhouette. Procedural kinds draw
  // here; a 'sprite' visual is rendered by WeaponSpriteSystem from the SAME weaponAnchor (one grip, two substrates).
  if (wv && wv.kind !== 'sprite') {
    const wa = weaponAnchor(e);
    if (wa) drawWeapon(g, wa.x - t.x, wa.y - t.y, wa.angle, wv);
  }

  // lead (weapon) hand first so a two-handed grip can place the off-hand on the handle above it
  let leadX = 0;
  let leadY = 0;
  let leadSet = false;
  for (const side of [1, -1] as const) {
    const acting = !!pose && actSide === side;
    // Gomu rubber arm(s): the acting hand becomes a thick limb out to a far fist (Pistol/Gatling); a Rocket
    // grab throws BOTH arms. (Foot stretches — Gomu Stamp — are drawn separately below, hands untouched.)
    if (acting && m!.motion === 'stretch') {
      const c = flashing ? 0xffffff : rd.baseColor;
      const arm = (ax: number, ay: number, bx: number, by: number): void => {
        drawStretchLimb(g, ax, ay, bx, by, handR, c); // outlined tube + a clean cap at the root
        g.fillStyle(c, 1); // the fist at the end
        g.fillCircle(bx, by, handR * 1.2);
        g.lineStyle(2, OUTLINE, 1);
        g.strokeCircle(bx, by, handR * 1.2);
      };
      arm(pose!.hx, pose!.hy, pose!.tx, pose!.ty);
      if (shape?.bothHands) {
        const [sx, sy] = guardHand(drawA, -m!.side, r); // the OTHER guard hand, reaching the same way forward
        arm(sx, sy, sx + (pose!.tx - pose!.hx), sy + (pose!.ty - pose!.hy));
      }
      continue;
    }
    let hx: number;
    let hy: number;
    if (acting) {
      hx = pose!.hx;
      hy = pose!.hy;
    } else if (side === -1 && leadSet && wDef?.grip?.hands === 2) {
      // two-handed grip: the off-hand joins the HANDLE just above the lead hand instead of resting
      const sp = wDef.grip.spacing ?? r * 0.5;
      hx = leadX + Math.cos(drawA) * sp;
      hy = leadY + Math.sin(drawA) * sp;
    } else {
      [hx, hy] = restHand(drawA, side, r);
    }
    // sleeve: a garb-colored upper-arm from the shoulder slab to the fist — RESTING hands only (the
    // sketch's hanging arms). A swinging hand flies as the bare fist, like the kick's detached foot —
    // a sleeve stretching with the thrust would read as a rubber arm and steal Gomu's visual identity.
    if (!acting) {
      const shx = Math.cos(drawA) * (A.shoulderFwd * r) - Math.sin(drawA) * (side * A.shoulderOut * r);
      const shy = Math.sin(drawA) * (A.shoulderFwd * r) + Math.cos(drawA) * (side * A.shoulderOut * r);
      g.lineStyle(A.armW * r + 4, OUTLINE, 1);
      g.lineBetween(shx, shy, hx, hy);
      g.lineStyle(A.armW * r, garb, 1);
      g.lineBetween(shx, shy, hx, hy);
    }
    g.fillStyle(flashing ? 0xffffff : rd.baseColor, 1);
    g.fillCircle(hx, hy, handR);
    g.lineStyle(2, OUTLINE, 1);
    g.strokeCircle(hx, hy, handR);
    if (side === 1) {
      leadX = hx;
      leadY = hy;
      leadSet = true;
    }
  }
  // plain kick (the SIDE KICK): a foot emerges from the limb spot and swings forward
  if (footKick) {
    drawFoot(g, pose!.hx, pose!.hy, drawA, handR, flashing ? 0xffffff : rd.baseColor, m!.side ?? 1);
  }
  // Gomu Stamp: a stretching LEG from the hip out to a far foot — the hands stay at rest (it's a leg, not an arm)
  if (footStretch) {
    const c = flashing ? 0xffffff : rd.baseColor;
    const [hox, hoy] = restHand(drawA, m!.side, r * 0.5); // a hip on the kicking side — inner, under the body
    const tx = hox + (pose!.tx - pose!.hx); // extend from the hip by the current stretch reach
    const ty = hoy + (pose!.ty - pose!.hy);
    drawStretchLimb(g, hox, hoy, tx, ty, handR, c); // outlined leg-tube + a clean cap at the hip
    drawFoot(g, tx, ty, drawA, handR, c, m!.side ?? 1);
  }

  // body anatomy — ON TOP of the hands/sleeves. Torso + shoulder slabs twist with the SWING (drawA) so an
  // arc cut visibly turns the shoulder line; the head stays on the raw AIM (a) so hat/face sprites — which
  // only know the aim — can never slide off it mid-swing. Each part carries its OWN outline so the anatomy
  // reads as SEGMENTS (head / slabs / crescent, per the base-art sketch), not one fused garment.
  g.save();
  g.rotateCanvas(drawA);
  g.fillStyle(garb, 1);
  g.fillEllipse(A.torsoFwd * r, 0, A.torsoHalfL * r * 2, A.torsoHalfW * r * 2);
  g.lineStyle(2, OUTLINE, 1);
  g.strokeEllipse(A.torsoFwd * r, 0, A.torsoHalfL * r * 2, A.torsoHalfW * r * 2);
  for (const s of [-1, 1] as const) {
    g.fillStyle(garb, 1);
    g.fillEllipse(A.shoulderFwd * r, s * A.shoulderOut * r, A.shoulderHalfL * r * 2, A.shoulderHalfW * r * 2);
    g.lineStyle(2, OUTLINE, 1);
    g.strokeEllipse(A.shoulderFwd * r, s * A.shoulderOut * r, A.shoulderHalfL * r * 2, A.shoulderHalfW * r * 2);
  }
  g.restore();
  // head — skin, offset AWAY from the aim (the perspective model; same anchor AccessorySystem hangs hats from)
  const headX = -Math.cos(a) * A.headBack * r;
  const headY = -Math.sin(a) * A.headBack * r;
  g.fillStyle(flashing ? 0xffffff : rd.baseColor, 1);
  g.fillCircle(headX, headY, A.headR * r);
  g.lineStyle(2, OUTLINE, 1); // thin solid outline, identical to the hands
  g.strokeCircle(headX, headY, A.headR * r);

  // Armament Haki coating ring while active — sized to wrap the full (shoulder-wide) silhouette
  if (e.tags?.has('haki.armament.active')) {
    g.lineStyle(3, 0x0a0a12, 0.92);
    g.strokeCircle(0, 0, (A.shoulderOut + A.shoulderHalfW) * r + 2);
  }

  // (the held weapon is drawn earlier, behind the body + under its own gripping fist — see the hand loop)

  // health bar (+ a thinner stamina bar directly beneath it)
  if (rd.showHpBar && e.health) {
    const w = r * 2.2;
    const h = 4;
    const bx = -w / 2;
    const by = -r - 10;
    const pct = clamp(e.health.hp / e.health.maxHp, 0, 1);
    g.fillStyle(0x000000, 0.5);
    g.fillRect(bx - 1, by - 1, w + 2, h + 2);
    g.fillStyle(HP_BAR_COLOR, 1);
    g.fillRect(bx, by, w * pct, h);
    if (e.combatant) {
      const sh = 3;
      const sy = by + h + 1;
      const spct = clamp(e.combatant.stam / e.combatant.maxStam, 0, 1);
      g.fillStyle(0x000000, 0.5);
      g.fillRect(bx - 1, sy - 1, w + 2, sh + 2);
      g.fillStyle(0x5ea0d8, 1); // same blue as the HUD stamina bar
      g.fillRect(bx, sy, w * spct, sh);
    }
  }
};

/** A ground pickup with a glow so it reads as collectible — a per-category glyph (blade / fruit / hat). */
export const drawPickup: DrawFn = (g, e) => {
  const cat = e.pickup!.item.cat;
  const r = e.transform!.r;
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(0, r * 0.6, r * 1.6, r * 0.8);
  g.fillStyle(0xf0d060, 0.18);
  g.fillCircle(0, 0, r + 6);
  if (cat === 'weapon') {
    g.lineStyle(6, OUTLINE, 0.9);
    g.lineBetween(-r, r * 0.7, r, -r * 0.9);
    g.lineStyle(4, 0xcdd3da, 1);
    g.lineBetween(-r, r * 0.7, r, -r * 0.9);
    g.fillStyle(0x6b4a2a, 1);
    g.fillCircle(-r, r * 0.7, 3);
  } else {
    // fruit (and any category without its own sprite): the collectible orb. Sprite-backed items (accessories
    // with art) never reach here — they render their own texture via Render.sprite (see Spawner.spawnPickup).
    g.fillStyle(0x7a3da8, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(2, OUTLINE, 0.9);
    g.strokeCircle(0, 0, r);
    g.fillStyle(0x4a7c3f, 1);
    g.fillCircle(r * 0.3, -r * 0.8, 2.5); // stem leaf
  }
};

interface CritterLook {
  ear: number;
  snout: number;
  spots?: number; // patch colour (cows); omit for a plain hide (pigs)
}

/** A top-down farm animal: an oval body along the facing angle, four hoof-nubs, a head with ears + a snout, and
 *  a little tail. Shared by cow/pig — they differ only by CritterLook colours + whether they have spots. */
function drawQuadruped(g: Phaser.GameObjects.Graphics, e: Parameters<DrawFn>[1], o: CritterLook): void {
  const t = e.transform!;
  const r = t.r;
  const flashing = !!e.health && e.health.hitFlash > 0;
  const body = flashing ? 0xffffff : e.render!.baseColor; // the BodyDef is the single color source
  g.fillStyle(0x000000, 0.2); // contact shadow (unrotated)
  g.fillEllipse(0, r * 0.5, r * 2.4, r * 1.1);
  g.save();
  g.rotateCanvas(t.angle); // +x now points where the animal faces
  // legs: four hoof nubs at the body corners
  g.fillStyle(OUTLINE, 1);
  for (const sx of [-1, 1] as const) for (const sy of [-1, 1] as const) g.fillCircle(sx * r * 0.72, sy * r * 0.6, r * 0.26);
  // tail
  g.lineStyle(3, OUTLINE, 1);
  g.lineBetween(-r * 1.05, 0, -r * 1.5, r * 0.35);
  // body (outline then fill), elongated along the facing axis
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(0, 0, r * 2.5 + 4, r * 1.8 + 4);
  g.fillStyle(body, 1);
  g.fillEllipse(0, 0, r * 2.5, r * 1.8);
  if (o.spots) {
    g.fillStyle(o.spots, 1);
    g.fillEllipse(r * 0.45, -r * 0.35, r * 0.8, r * 0.65);
    g.fillEllipse(-r * 0.55, r * 0.4, r * 0.7, r * 0.55);
  }
  // head at the front
  const hx = r * 1.35;
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(hx, 0, r * 0.82 + 3);
  g.fillStyle(body, 1);
  g.fillCircle(hx, 0, r * 0.82);
  // ears
  g.fillStyle(o.ear, 1);
  g.fillCircle(hx - r * 0.1, -r * 0.82, r * 0.3);
  g.fillCircle(hx - r * 0.1, r * 0.82, r * 0.3);
  // snout (outlined) + nostrils
  g.fillStyle(OUTLINE, 1);
  g.fillEllipse(hx + r * 0.6, 0, r * 0.62 + 2, r * 0.78 + 2);
  g.fillStyle(o.snout, 1);
  g.fillEllipse(hx + r * 0.6, 0, r * 0.62, r * 0.78);
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(hx + r * 0.6, -r * 0.2, r * 0.09);
  g.fillCircle(hx + r * 0.6, r * 0.2, r * 0.09);
  g.restore();
}

const drawCow: DrawFn = (g, e) => drawQuadruped(g, e, { spots: 0x4b3a2b, ear: 0x3f2f22, snout: 0xd98f8f });
const drawPig: DrawFn = (g, e) => drawQuadruped(g, e, { ear: 0xcf7a84, snout: 0xcf7a84 });

/** Draw registry keyed by BodyDef.draw (BodyKey). Humanoids share the moomoo body look; wildlife has its own quadruped. */
export const draws: Record<string, DrawFn> = {
  hero: drawActor,
  grunt: drawActor,
  captain: drawActor,
  villager: drawActor,
  cow: drawCow,
  pig: drawPig,
  pickup: drawPickup,
};
