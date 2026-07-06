import type Phaser from 'phaser';
import { Abilities } from '../combat/Ability';
import { HAND_R_FRAC, activeSide, guardHand, restHand, swingGeomOf, swingPose } from '../combat/swing';
import { clamp } from '../core/math';
import type { AccessorySlot } from '../defs/accessories';
import { Weapons, type WeaponVisual } from '../defs/layers';
import type { Entity } from '../ecs/components';
import { rollProgress } from './rollAnim';

/** The procedurally-drawn weapon kinds — 'sprite' visuals render via WeaponSpriteSystem instead. */
type ProceduralWeaponVisual = Exclude<WeaponVisual, { kind: 'sprite' }>;

/** A procedural draw function: paint the entity into its Graphics in LOCAL space (presentation-owned). */
export type DrawFn = (g: Phaser.GameObjects.Graphics, e: Entity) => void;

const OUTLINE = 0x4d4a45; // charcoal gray (lighter than near-black), 1px solid on body + hands
const HP_BAR_COLOR = 0x5ec85e; // green; health reads the same for everyone — friend/foe is the NAME color, not the bar

/** Counter-rotation (rad) applied to the overhead HP/stamina/posture bars so they stay screen-upright while
 *  the shift-lock camera spins — WorldScene passes −camRot each frame (0 normally). Like the nameplate text,
 *  the bars are a READOUT, not part of the world, so they shouldn't tumble with the view. */
let barRotation = 0;
export function setBarRotation(rot: number): void {
  barRotation = rot;
}

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
 *  a plain 'blade' (line + rounded tip) or a 'club'. (Real weapons use hand-drawn sprites; these procedural
 *  kinds are the zero-art prototyping fallback.) */
function drawWeapon(g: Phaser.GameObjects.Graphics, hx: number, hy: number, a: number, v: ProceduralWeaponVisual): void {
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  const px = -Math.sin(a); // perpendicular to the aim
  const py = Math.cos(a);
  const L = v.length;
  const W = v.width;
  const ex = hx + fx * L;
  const ey = hy + fy * L;

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

  // 'blade' — a generic straight blade primitive (line + rounded tip + wooden grip). Zero-art prototyping look
  // for any future weapon; the cutlass now uses hand-drawn sprite art (weapon.cutlass), not this.
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
  // idle OR guard: the weapon grips the LEAD REST HAND — the SAME position drawActor draws that hand at, so the
  // grip never floats off the fist. On block/parry (same anim for both) we KEEP that grip and only nudge it a
  // little forward + tilt the blade nearly HORIZONTAL across the front (held sideways to catch a blow).
  // GUARD pose: the sword is held forward + tilted nearly HORIZONTAL across the front. The DRAWN HAND is moved to
  // THIS grip too (see guardGrip in drawActor) so the fist actually holds the sword, not floats off it.
  const cb = e.combatant;
  if (cb && (cb.blocking || (cb.parryT ?? 0) > 0)) {
    const [gx, gy] = guardGrip(drawA, t.r);
    return { x: t.x + gx, y: t.y + gy, angle: drawA - GUARD_BLADE_TILT };
  }
  const [hx, hy] = restHand(drawA, 1, t.r); // idle: held at the lead rest hand
  return { x: t.x + hx, y: t.y + hy, angle: drawA };
}

/** The GUARD grip point (×r offsets, LOCAL) — where the sword's handle AND the drawn lead hand both sit while
 *  blocking/parrying, so they coincide (the fist holds the sword). Shared by weaponAnchor + drawActor. */
export function guardGrip(aim: number, r: number): [number, number] {
  const [gx, gy] = guardHand(aim, 1, r); // the combat guard hand (up + forward)
  const fwd = r * GUARD_HAND_FWD; // a bit further forward toward the aim
  return [gx + Math.cos(aim) * fwd, gy + Math.sin(aim) * fwd];
}

/** How far the blade is rotated OFF the aim when raised to guard (rad) — ~77°, nearly HORIZONTAL across the
 *  front (held sideways to block), not diagonal or pointing forward. */
const GUARD_BLADE_TILT = 1.35;
/** How far forward (×r, along the aim) the guard grip (hand + sword) sits — a bit ahead of the body. */
const GUARD_HAND_FWD = 0.45;

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

  // contact shadow — sized to the shoulder-wide anatomy, not just the head (stays FLAT — the shadow doesn't roll)
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(0, r * 0.7, r * 2.1, r * 0.95);

  // ROLL — a DEDICATED pose, not a squashed standing figure: while a roll is in flight (mover.rollProg) the
  // upright silhouette is REPLACED by a tucked BALL that spins as it travels. Because the drawn shape is already
  // a ball, the spin reads as genuine rolling (a spinning standing person just looks like a top). Same idiom as
  // the kick/stretch poses that swap what drawActor draws. Short-circuits the standing body entirely; the
  // overhead bars still draw below. Presentation-only (reads sim-set mover fields).
  const rollP = rollProgress(e); // 0..1 across the roll, or null if not rolling
  if (rollP !== null) {
    drawRollPose(g, e, rollP);
    drawOverheadBars(g, e); // HP/stamina/posture readout still shows mid-roll
    return;
  }

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
      // BOTH arms shown when: a Rocket grab (bothHands), OR a FLURRY during its WINDUP — the Gatling cocks
      // BOTH hands back to wind up, then only the single acting hand throws the alternating R→L→R→L jabs.
      const p = m!.dur > 0 ? m!.t / m!.dur : 1;
      const flurryWindup = (shape?.jabs ?? 1) > 1 && p < m!.phases.windup;
      if (shape?.bothHands || flurryWindup) {
        const [sx, sy] = guardHand(drawA, -m!.side, r); // the OTHER guard hand, reaching/cocking the same way
        arm(sx, sy, sx + (pose!.tx - pose!.hx), sy + (pose!.ty - pose!.hy));
      }
      continue;
    }
    let hx: number;
    let hy: number;
    const isGuarding = e.combatant?.blocking || (e.combatant?.parryT ?? 0) > 0;
    const armedGuard = !!wDef && isGuarding; // holding a weapon up to guard
    const unarmedGuard = !wDef && isGuarding; // bare fists up to guard (a boxer's guard)
    const guarding = armedGuard || unarmedGuard;
    const guardingHand = side === 1 && armedGuard; // the LEAD hand grips the raised sword
    if (acting) {
      hx = pose!.hx;
      hy = pose!.hy;
    } else if (guardingHand) {
      // GUARDING with a weapon: the LEAD hand moves up to the guard grip so the fist actually HOLDS the raised
      // sword (weaponAnchor pins the handle to this SAME point) — otherwise the blade floats off the hand.
      [hx, hy] = guardGrip(drawA, r);
    } else if (unarmedGuard) {
      // UNARMED guard: BOTH fists come up in front (a boxer's guard) — the raised combat guard hand per side.
      [hx, hy] = guardHand(drawA, side, r);
    } else if (side === -1 && leadSet && wDef?.grip?.hands === 2) {
      // two-handed grip: the off-hand joins the HANDLE just above the lead hand instead of resting
      const sp = wDef.grip.spacing ?? r * 0.5;
      hx = leadX + Math.cos(drawA) * sp;
      hy = leadY + Math.sin(drawA) * sp;
    } else {
      [hx, hy] = restHand(drawA, side, r);
    }
    // sleeve: a garb-colored upper-arm from the shoulder slab to the fist — RESTING hands only (the
    // sketch's hanging arms). A swinging hand flies as the bare fist, like the kick's detached foot; while
    // GUARDING, NEITHER hand draws a sleeve — both fists float bare (no arm stretching to the guard grip).
    if (!acting && !guarding) {
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
  // AXE-KICK draw-order FLIP (Gomu Ono): the leg is OVERHEAD while raised (scale > 1 → drawn LATER, on top of the
  // body, further down) but PLANTED on the ground once it lands (scale ≈ 1 → drawn HERE, under the body, occluded
  // by him). The scale — which tracks the rise — is the over/under signal, the same trick the roll pose uses.
  const axeFoot = m?.motion === 'axe';
  const axeRaised = axeFoot && (pose?.scale ?? 1) > 1.15; // still up in the air (above the landed threshold)
  // plain kick (the SIDE KICK): a low, ground-level foot to the side, drawn UNDER the body. A LANDED axe foot
  // draws here too (planted → underneath); a still-RAISED axe foot is deferred to the on-top block below.
  if (footKick && (!axeFoot || !axeRaised)) {
    drawFoot(g, pose!.hx, pose!.hy, drawA, handR * (pose!.scale ?? 1), flashing ? 0xffffff : rd.baseColor, m!.side ?? 1);
  }
  // Gomu Stamp: a stretching LEG from the hip out to a far foot — the hands stay at rest (it's a leg, not an arm)
  if (footStretch) {
    const c = flashing ? 0xffffff : rd.baseColor;
    // draw the leg from the SWING POSE's own base→tip — the SAME segment the hitbox (MeleeSystem) uses, so the
    // drawn leg and the damage line up ("what you see is what hits"). (The old code recomputed a separate
    // restHand hip, so the drawn leg started/ended at a DIFFERENT spot than the hitbox — the mismatch.)
    drawStretchLimb(g, pose!.hx, pose!.hy, pose!.tx, pose!.ty, handR, c); // outlined leg-tube + a clean cap at the hip
    drawFoot(g, pose!.tx, pose!.ty, drawA, handR, c, m!.side ?? 1);
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

  // (the GUARD arc crescent that was here moved to DebugOverlay (combat.guard flag) — normal play now shows the
  // guard via the RAISED WEAPON POSE (weaponAnchor); the arc is a debug aid for the block/parry cover geometry.)
  // (the held weapon is drawn earlier, behind the body + under its own gripping fist — see the hand loop)

  // AXE-KICK foot (Gomu Ono) while RAISED — drawn LAST, ON TOP of the body + head: the leg towers OVERHEAD, so it
  // OCCLUDES him during the rise. Once it lands (scale ≈ 1) it's drawn UNDER the body earlier instead (the flip).
  if (axeRaised && pose) {
    drawFoot(g, pose.hx, pose.hy, drawA, handR * (pose.scale ?? 1), flashing ? 0xffffff : rd.baseColor, m!.side ?? 1);
  }

  drawOverheadBars(g, e); // hp / stamina / posture readout (shared with the roll pose above)
};

/**
 * The ROLL pose — a top-down forward dive-roll faked as ONE revolution. A pure top-down camera can't SHOW
 * head-over-heels rotation (it's edge-on to the view), so we fake it: the HEAD (and the hands, phased with it)
 * traces ONE circle around the body over the roll, and — the load-bearing trick — the DRAW ORDER flips as it
 * goes, so the parts pass OVER the body (drawn on top) in the first half and UNDER it (drawn behind) in the
 * second. That single over-then-under pass reads as one head-over-heels roll.
 *
 * Timeline (prog 0→1, one revolution θ = prog·2π; `along` = signed forward offset = cos θ, `depth` = sin θ):
 *   0.00  forward + coming OVER the top (on top)         θ=0     along=+1  depth→+
 *   0.25  crossing over the front                        θ=π/2   along=0   depth=+1 (highest/on top)
 *   0.50  back, going UNDER  (draw-order FLIPS to behind) θ=π     along=−1  depth→−
 *   0.75  under the back                                 θ=3π/2  along=0   depth=−1 (lowest/behind)
 *   1.00  forward again, rising to the feet              θ=2π    along=+1
 * Body: a tucked torso blob, smallest+lowest at mid-roll. Weapon + hat are hidden (tucked in). One cycle = one roll.
 */
function drawRollPose(g: Phaser.GameObjects.Graphics, e: Entity, prog: number): void {
  const t = e.transform!;
  const rd = e.render!;
  const r = t.r;
  const flashing = !!e.health && e.health.hitFlash > 0;
  const garb = flashing ? 0xffffff : rd.garbColor ?? darken(rd.baseColor);
  const skin = flashing ? 0xffffff : rd.baseColor;
  const handR = r * HAND_R_FRAC;
  const m = e.mover!;
  const travel = Math.atan2(m.dvy, m.dvx); // roll direction — the loop sweeps along THIS axis
  const fx = Math.cos(travel);
  const fy = Math.sin(travel);
  const pxl = -Math.sin(travel); // perpendicular to travel (for the small hand spread)
  const pyl = Math.cos(travel);

  const theta = prog * Math.PI * 2; // ONE revolution across the roll
  const along = Math.cos(theta); // signed FORWARD offset: +1 front → −1 back → +1
  // FORWARD roll: at the FRONT the head dives DOWN + UNDER (not over the top — that would read as a BACKWARD
  // roll while moving forward). So depth is NEGATIVE sin: under at the front, over the top at the back.
  const depth = -Math.sin(theta); // >0 = passing OVER the top (draw on top); <0 = going UNDER (draw behind)
  const overTop = depth >= 0;

  // the body's tuck: smallest + lowest at mid-roll (the over-the-top moment)
  const tuck = Math.sin(prog * Math.PI); // 0→1→0
  const bodyLong = r * (1.05 - 0.3 * tuck); // ellipse long axis (along travel), ducks in mid-roll
  const bodyWide = r * (0.9 - 0.28 * tuck); // short axis

  // HEAD position: on the loop circle — `along` forward + a depth-driven size (over-the-top parts read BIGGER/closer,
  // under parts smaller/further). A tiny sideways bob so it isn't a dead-straight line.
  const headFwd = along * r * 0.95;
  const headScale = 0.75 + 0.35 * depth; // 0.4 (deep under) → 1.1 (over the top) — the fake-perspective size cue
  const headR = ANATOMY.headR * r * Math.max(0.4, headScale);
  const hcx = fx * headFwd;
  const hcy = fy * headFwd;

  // HANDS: trace the SAME loop, phased a bit ahead of the head (so the limbs lead the tumble), and a touch to
  // each side. Their forward offset uses a shifted angle so they don't sit exactly on the head.
  const handAng = theta + 0.7; // lead the head slightly
  const handFwd = Math.cos(handAng) * r * 1.0;
  const hand = (side: number): [number, number] => [fx * handFwd + pxl * side * r * 0.45, fy * handFwd + pyl * side * r * 0.45];
  const handScale = Math.max(0.5, 0.7 + 0.3 * Math.sin(handAng));

  const drawHead = (): void => {
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(hcx, hcy, headR + 1.5);
    g.fillStyle(skin, 1);
    g.fillCircle(hcx, hcy, headR);
  };
  const drawHands = (): void => {
    // fists ONLY — no connecting sleeve line. In a tucked roll the arms are wrapped in; a stubby line from the
    // body center to a close-tucked hand read as a stray dash. The hands sweeping the loop carry the motion.
    for (const side of [1, -1] as const) {
      const [hx, hy] = hand(side);
      const hr = handR * handScale;
      g.fillStyle(skin, 1);
      g.fillCircle(hx, hy, hr);
      g.lineStyle(2, OUTLINE, 1);
      g.strokeCircle(hx, hy, hr);
    }
  };
  const drawBody = (): void => {
    g.save();
    g.rotateCanvas(travel);
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(0, 0, bodyLong * 2 + 3, bodyWide * 2 + 3);
    g.fillStyle(garb, 1);
    g.fillEllipse(0, 0, bodyLong * 2, bodyWide * 2);
    g.restore();
  };

  // THE DRAW-ORDER FLIP: over-the-top half → head/hands ON TOP of the body; under half → BEHIND it.
  if (overTop) {
    drawBody();
    drawHands();
    drawHead();
  } else {
    drawHead();
    drawHands();
    drawBody();
  }
}

/** OVERHEAD BARS (hp / stamina / posture) — a READOUT, so counter-rotated by the camera spin (barRotation) to
 *  stay screen-upright under shift lock, like the nameplate. Extracted so BOTH the normal figure and the roll
 *  pose draw the same bars (the roll returns early and calls this directly). */
function drawOverheadBars(g: Phaser.GameObjects.Graphics, e: Entity): void {
  const t = e.transform!;
  const rd = e.render!;
  const r = t.r;
  const cb = e.combatant;
  g.save();
  g.rotateCanvas(barRotation);

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

  // posture: a VERTICAL guard meter just right of the silhouette, filling UPWARD toward the break (Sekiro-
  // style — vertical reads distinctly from the horizontal HP/stamina). ALWAYS shown for a combatant (like
  // the HP/stamina bars): the track sits empty when composed and fills amber as guard strain builds, so you
  // can watch it climb toward a break in real time — not just glimpse it for one frame under fire.
  if (rd.showHpBar && cb && cb.maxPosture > 0) {
    const ph = r * 2; // bar height ≈ the body
    const pw = 1; // thin sliver
    const pbx = r + 5; // to the RIGHT of the silhouette
    const pby = -ph / 2; // vertically centred on the body
    const ppct = clamp(cb.posture / cb.maxPosture, 0, 1);
    g.fillStyle(0x000000, 0.5); // the empty track — always visible so the meter reads as a fixture
    g.fillRect(pbx - 0.5, pby - 0.5, pw + 1, ph + 1); // 0.5px margin per side (tighter than the 1px HP/stamina outline)
    if (ppct > 0) {
      g.fillStyle(0xe8a33d, 1); // amber — matches the plate's posture bar
      g.fillRect(pbx, pby + ph * (1 - ppct), pw, ph * ppct); // grows from the BOTTOM up
    }
  }

  g.restore(); // end the bar counter-rotation
}

/** A ground pickup with a glow so it reads as collectible — a per-category glyph (blade / fruit / hat). */
export const drawPickup: DrawFn = (g, e) => {
  const cat = e.pickup!.item.cat;
  const r = e.transform!.r;
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(0, r * 0.6, r * 1.6, r * 0.8);
  g.fillStyle(0xf0d060, 0.18);
  g.fillCircle(0, 0, r + 6);
  if (cat === 'weapon') {
    // draw the weapon's OWN procedural visual (blade/club) laid diagonally, so each weapon pickup reads as
    // itself — not one generic blade glyph for every weapon. A sprite-visual
    // weapon renders its texture via Render.sprite (Spawner.spawnPickup) and never reaches here.
    const wv = Weapons.get(e.pickup!.item.id).visual;
    if (wv && wv.kind !== 'sprite') {
      const ang = -Math.PI / 4; // lie diagonally on the ground (up-right), grip at lower-left
      const gx = -Math.cos(ang) * r * 0.5; // grip point, so the weapon sits centered on the tile
      const gy = -Math.sin(ang) * r * 0.5;
      drawWeapon(g, gx, gy, ang, wv);
    } else {
      g.lineStyle(6, OUTLINE, 0.9); // fallback glyph for a weapon with no procedural visual
      g.lineBetween(-r, r * 0.7, r, -r * 0.9);
      g.lineStyle(4, 0xcdd3da, 1);
      g.lineBetween(-r, r * 0.7, r, -r * 0.9);
      g.fillStyle(0x6b4a2a, 1);
      g.fillCircle(-r, r * 0.7, 3);
    }
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
  horns?: number; // horn colour — the bull's tell (a pair of forward-curving horns on the head); omit for hornless
}

/** A top-down farm animal: an oval body along the facing angle, four hoof-nubs, a head with ears + a snout, and
 *  a little tail. Shared by cow/pig/bull — they differ by CritterLook colours + spots + horns. The head LUNGES
 *  forward during a `gore` swing (reads e.melee, synced to the gore motion phase) so the headbutt animates. */
function drawQuadruped(g: Phaser.GameObjects.Graphics, e: Parameters<DrawFn>[1], o: CritterLook): void {
  const t = e.transform!;
  const r = t.r;
  const flashing = !!e.health && e.health.hitFlash > 0;
  const body = flashing ? 0xffffff : e.render!.baseColor; // the race's skin/hide is the single color source

  // HEAD-LUNGE: during a gore swing the head IS the hitbox — so the DRAWN head reads the SAME swingPose the
  // MeleeSystem hits from (one source → what you see is what hits, exactly like the hero's fist). The pose's
  // center is the head's lunging position; project it to the local along-facing distance and offset the head by
  // it. 0 when not goring (head sits at its rest anchor r×1.35). This is the head as an animated attack limb.
  // CRUCIAL: mid-gore, draw the whole animal along the swing's COMMITTED angle (m.angle), not the live t.angle —
  // the hitbox is locked to m.angle at swing-start (with scatter), so drawing off t.angle would point the head a
  // DIFFERENT way than the damage (the bug: head faces you, hitbox lands elsewhere). One angle → they agree.
  let lunge = 0;
  const m = e.melee;
  const goring = !!m && m.motion === 'gore';
  const drawAng = goring ? m!.angle : t.angle; // commit the body to the attack direction during the gore
  if (goring) {
    const d = Abilities.get(m!.ability);
    if (d.shape) {
      const pose = swingPose(m!, d.shape, swingGeomOf(e));
      const cx = (pose.hx + pose.tx) / 2; // pose center (world-frame offset from the unit)
      const cy = (pose.hy + pose.ty) / 2;
      const headDist = cx * Math.cos(m!.angle) + cy * Math.sin(m!.angle); // project onto the SWING axis = along-axis distance
      lunge = headDist - r * 1.35; // offset from the head's resting anchor (drawQuadruped draws head at r×1.35)
    }
  }

  g.fillStyle(0x000000, 0.2); // contact shadow (unrotated)
  g.fillEllipse(0, r * 0.5, r * 2.4, r * 1.1);
  g.save();
  g.rotateCanvas(drawAng); // +x now points where the animal faces (or where it's GORING, mid-swing)
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
  // head at the front (+ the gore lunge)
  const hx = r * 1.35 + lunge;
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(hx, 0, r * 0.82 + 3);
  g.fillStyle(body, 1);
  g.fillCircle(hx, 0, r * 0.82);
  // ears
  g.fillStyle(o.ear, 1);
  g.fillCircle(hx - r * 0.1, -r * 0.82, r * 0.3);
  g.fillCircle(hx - r * 0.1, r * 0.82, r * 0.3);
  // HORNS — small, simple, curved. Drawn ON TOP OF the head (after it), emerging from the head's MIDDLE and
  // curling gently OUTWARD to each side (like the reference). A short quadratic Bézier spine with a UNIFORM-ish
  // width (only a slight taper at the very tip) so the outline stays even, not pinching to a thread.
  if (o.horns !== undefined) {
    const SEG = 8;
    const drawHorn = (side: number, pad: number): void => {
      // a small horn that CURLS into a HALF-CIRCLE hook at the tip: the Bézier control sits far out so the spine
      // bows hard and the tip curls back FORWARD/INWARD, ending in a rounded cap (drawn below) — a semicircle
      // hook, not a straight point. Rooted at the head's middle.
      const p0x = hx - r * 0.1, p0y = side * r * 0.12; // root near the head's MIDDLE
      const cX = hx + r * 0.1, cY = side * r * 1.1; // control: far out → a strong bow
      const p2x = hx + r * 0.95, p2y = side * r * 0.8; // tip: curls FORWARD + back inward (the hook)
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG, v = 1 - u;
        pts.push([v * v * p0x + 2 * v * u * cX + u * u * p2x, v * v * p0y + 2 * v * u * cY + u * u * p2y]);
      }
      const width = (u: number): number => (r * 0.17 + pad) * (0.7 + 0.3 * (1 - u)); // fairly even (rounded tip caps it)
      g.beginPath();
      for (let i = 0; i <= SEG; i++) {
        const [x, y] = pts[i];
        const [px, py] = i < SEG ? pts[i + 1] : pts[i];
        const [qx, qy] = i > 0 ? pts[i - 1] : pts[i];
        const nx = -(py - qy), ny = px - qx;
        const nl = Math.hypot(nx, ny) || 1;
        const w = width(i / SEG);
        if (i === 0) g.moveTo(x + (nx / nl) * w, y + (ny / nl) * w);
        else g.lineTo(x + (nx / nl) * w, y + (ny / nl) * w);
      }
      for (let i = SEG; i >= 0; i--) {
        const [x, y] = pts[i];
        const [px, py] = i < SEG ? pts[i + 1] : pts[i];
        const [qx, qy] = i > 0 ? pts[i - 1] : pts[i];
        const nx = -(py - qy), ny = px - qx;
        const nl = Math.hypot(nx, ny) || 1;
        const w = width(i / SEG);
        g.lineTo(x - (nx / nl) * w, y - (ny / nl) * w);
      }
      g.closePath();
      g.fillPath();
      // rounded HALF-CIRCLE cap at the tip — the hook curls into a round end, not a point
      const [tx, ty] = pts[SEG];
      g.fillCircle(tx, ty, width(1) + (pad > 0 ? 0.5 : 0));
    };
    g.fillStyle(OUTLINE, 1);
    for (const side of [-1, 1] as const) drawHorn(side, 1.5); // outlined silhouette (padded)
    g.fillStyle(o.horns, 1);
    for (const side of [-1, 1] as const) drawHorn(side, 0); // pale horn on top
  }
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
const drawBull: DrawFn = (g, e) => drawQuadruped(g, e, { ear: 0x2a2018, snout: 0x8a6a5a, horns: 0xe8e0d0 }); // pale horns, dark ears/hide

/** Draw registry keyed by BodyDef.draw (BodyKey). Humanoids share the moomoo body look; wildlife has its own quadruped. */
/** Draw registry keyed by RaceDef.draw — the SILHOUETTE. Every humanoid race shares 'actor' (the moomoo
 *  body look); wildlife races have their own quadruped draw. 'pickup' is a non-unit draw (ground items). */
export const draws: Record<string, DrawFn> = {
  actor: drawActor,
  cow: drawCow,
  pig: drawPig,
  bull: drawBull,
  pickup: drawPickup,
};
