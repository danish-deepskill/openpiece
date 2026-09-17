import type Phaser from 'phaser';
import { GEPPO_HOVER_HEIGHT, GEPPO_KICK_INTERVAL } from '../config/constants';
import { draws, type DrawEnv, type DrawFn } from '../draw/actorDraws';
import { drawShip, drawShipRig } from '../draw/shipDraws';
import { ShipHulls } from '../defs/ships';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { WindSystem } from './WindSystem';
import type { TileGrid } from '../world/TileGrid';
import type { ViewPose } from './ViewPose';

const WADE_ALPHA = 0.5; // partly submerged — shared by a shallow wade AND surface swimming (same look at the surface)
const SUBMERGED_ALPHA = 0.15; // fully UNDERWATER (dived / sunk) — barely visible below the surface

/** JUMP height fake (docs/design/MOVEMENT_AIR.md): peak scale-up of an airborne actor (bigger = higher). */
const JUMP_SCALE = 0.45;
/** LEDGE height fake: a smaller, STEADY scale-up while PERCHED atop a low wall (stone wall / ship rail) — you're
 *  one wall-height up, so a fraction of the jump's peak. Reads as "standing on something" (movement-frames.md). */
const LEDGE_SCALE = 0.15;
/** Ease time-constants (s) for the ledge step-up/down — the perch elevation GLIDES (settles in ~3τ) instead of
 *  flipping ±15% in one frame. ASYMMETRIC on purpose: mounting snaps up quickly (responsive), stepping OFF
 *  descends slower — a simple readable FALL (paired with the ground-contact ring MovementSystem emits at the
 *  step-down). Presentation-only smoothing; the sim's onLedge stays a hard flag. */
const LEDGE_EASE_TAU_UP = 0.05;
const LEDGE_EASE_TAU_DOWN = 0.12;
/** SUBMERGE fake: scale-DOWN of a fully-underwater actor (smaller = deeper/below) — the inverse of the jump. A
 *  gentle dip (→ 0.8×), enough to read as "sunk under" without shrinking to a dot. */
const SUBMERGE_SCALE = 0.2;
/** Peak translucency at the top of a jump (0 = opaque, 0.3 = 30% see-through) — a secondary "airborne" cue. */
const JUMP_FADE = 0.3;
/** Depth bias added to an airborne actor so it draws ABOVE grounded ones (it's nearer the camera). Large enough
 *  to clear any y-sort gap; airborne actors still sort among themselves by their own y. */
const AIR_DEPTH_LIFT = 100000;

/** Depth lift for a ship's RIGGING overlay (sail/spars/flag — drawShipRig): above every grounded walker on
 *  deck (the boom hangs over their heads), below AIR_DEPTH_LIFT — so a Geppo flyer passes OVER the rigging
 *  while a deck jump stays under the boom. */
const RIG_DEPTH_LIFT = 50000;

const GOD_AURA_COLOR = 0xffe66e; // warm gold — reads as "divine/charged", distinct from the green HP / blue stamina bars

/** Paint the god-mode aura into an actor's Graphics (LOCAL space, centered on the body). A slow-breathing
 *  golden halo: a soft outer glow + a crisper inner ring, both pulsing on a sine of wall-clock `now` so it
 *  reads as ACTIVE energy, not a static decal. Presentation-only (RenderSystem draws it before the body). */
function drawGodAura(g: Phaser.GameObjects.Graphics, r: number, now: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(now / 260); // 0..1, ~1.6s breath
  const glowR = r * (1.5 + 0.25 * pulse); // soft halo swells with the breath
  g.fillStyle(GOD_AURA_COLOR, 0.1 + 0.12 * pulse);
  g.fillCircle(0, 0, glowR);
  g.lineStyle(2, GOD_AURA_COLOR, 0.5 + 0.4 * pulse); // bright ring rides the same beat
  g.strokeCircle(0, 0, r * 1.35);
}

/** The full presentation draw registry: body draw keys + the non-actor looks. `Render.draw` (a plain string
 *  on the sim component) keys into this — the sim never holds a function pointer or a Graphics object. */
const DRAWS: Record<string, DrawFn> = { ...draws, ship: drawShip };

/**
 * Syncs a Graphics per render-entity to its transform, depth-sorts by y, and runs its procedural draw.
 * OWNS the Graphics side-table — entities carry only data (DESIGN_PATTERNS §9); gfx are created lazily on
 * first sight and destroyed by the orphan sweep when an entity despawns (no sim system touches gfx lifetime).
 */
export class RenderSystem {
  private readonly gfxById = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly rigById = new Map<number, Phaser.GameObjects.Graphics>(); // per-ship OVERHEAD rigging overlay
  private readonly imgById = new Map<number, Phaser.GameObjects.Image>(); // sprite-render entities (Render.sprite)
  /** Computed per-entity FINAL alpha this frame (wade/iframe-blink AND the jump-peak fade) — worn layers read it
   *  so a hat/blade fades EXACTLY with the body, including at the top of a jump. Must be the body's real alpha. */
  readonly alphaById = new Map<number, number>();
  /** Computed per-entity animation SCALE this frame (jump/Geppo rise, submerge sink) — worn layers (accessories,
   *  sprite weapons) read it so a hat/blade rides the body's scale-arc instead of detaching. Same publish-once
   *  pattern as alphaById: RenderSystem is the ONE place that derives the arc, so nobody recomputes it from mover. */
  readonly scaleById = new Map<number, number>();
  /** Computed per-entity DEPTH LIFT this frame (AIR_DEPTH_LIFT while airborne, else 0) — worn layers add it so a
   *  hat/blade rides ABOVE grounded units with the jumping body, instead of being left at ground depth under it. */
  readonly liftById = new Map<number, number>();
  /** EASED perch factor per entity (0..1, chasing onLedge at LEDGE_EASE_TAU) — render-side state only. */
  private readonly perchById = new Map<number, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly grid: TileGrid,
    private readonly wind: WindSystem, // draws that trim to the weather (sails) read it via DrawEnv
    private readonly view: ViewPose, // WHERE to draw each body this frame (interpolated between sim steps)
  ) {}

  /** The y a unit's layers (body, accessories, weapon) sort by. Normally its own transform.y — but an ON-DECK
   *  actor must draw ABOVE its hull yet still order fore/aft AMONG on-deck actors as they walk. So it sorts by its
   *  OWN world y, lifted past the hull's CURRENT on-screen y-extent — |sin|·length/2 + |cos|·width/2 for the
   *  ship's heading, NOT ship.r (the ocean radius ≈ half-WIDTH: it under-lifted a rotated hull — facing south the
   *  long axis is vertical, and a stern-side rider sorted UNDER the deck he stood on). Per-angle keeps the lift
   *  minimal, so riders overdraw as little as possible of whatever stands just south of the hull.
   *  The ONE home for this rule; every render layer reads it so they can never disagree. */
  sortY(e: Entity): number {
    if (e.onDeck) {
      const ship = this.world.byId(e.onDeck.shipId);
      if (ship?.transform && ship.ship) {
        const hull = ShipHulls.get(ship.ship.hull);
        const extentY = (Math.abs(Math.sin(ship.transform.angle)) * hull.length + Math.abs(Math.cos(ship.transform.angle)) * hull.width) / 2;
        return this.view.y(e) + extentY; // own DRAWN y (fore/aft order) lifted clear of the hull at ANY heading
      }
    }
    return this.view.y(e); // the drawn y, so depth order can't lag the drawn position
  }

  update(dt: number): void {
    const now = this.scene.time.now;
    const env: DrawEnv = { windDir: this.wind.dir, windStrength: this.wind.strength };
    const seen = new Set<number>();
    for (const e of this.world.with('transform', 'render')) {
      seen.add(e.id);
      const t = e.transform;
      const rd = e.render;
      const vx = this.view.x(e); // the DRAWN pose (interpolated) — t.x/t.y stay the sim truth for queries below
      const vy = this.view.y(e);
      // SUBMERSION fade: a SWIMMER reads mostly-submerged (the swim STATE, not the tile — mode is the truth);
      // a foot unit wading the shallows reads partly submerged. On-deck actors (aboard a ship) never submerge.
      let alpha = 1;
      if (!e.onDeck && e.mover) {
        // SUBMERGED (dived under) reads faint; SURFACE swim (deep OR shallow) reads the SAME as a shallow wade —
        // you're at the top of the water either way, so deep swimming shouldn't look more see-through than wading.
        if (e.mover.submerged) alpha = SUBMERGED_ALPHA;
        else if (e.mover.mode === 'swim' || (e.mover.mode === 'foot' && this.grid.terrainAtPx(t.x, t.y).water === 'shallow')) alpha = WADE_ALPHA;
      }
      // brief invulnerability blink, composed on top of the wade fade
      if (e.health && e.health.iframes > 0 && Math.floor(now / 50) % 2 === 0) alpha *= 0.5;
      // Defaults for the worn-layer channels — sprite entities keep these; actor bodies overwrite scale/lift and
      // REFINE alpha (with the jump-peak fade) once `air` is known below, so hats/weapons mirror the FINAL body.
      this.alphaById.set(e.id, alpha);
      this.scaleById.set(e.id, 1);
      this.liftById.set(e.id, 0);
      const depth = this.sortY(e) + (rd.depthBias ?? 0); // top-down y-sort (rider layers sort by the ship — sortY)

      if (rd.sprite) {
        // sprite entity: render the item's own loaded texture (e.g. an accessory pickup's art) as an Image
        let img = this.imgById.get(e.id);
        if (!img) {
          img = this.scene.add.image(0, 0, rd.sprite).setOrigin(0.5, 0.5);
          this.imgById.set(e.id, img);
        }
        const dia = t.r * 2 * (rd.spriteScale ?? 1);
        img.setTexture(rd.sprite).setPosition(vx, vy).setRotation(rd.rotateToAngle ? t.angle : 0).setDisplaySize(dia, dia).setDepth(depth).setAlpha(alpha);
        continue;
      }

      let gfx = this.gfxById.get(e.id);
      if (!gfx) {
        gfx = this.scene.add.graphics();
        this.gfxById.set(e.id, gfx);
      }
      gfx.setPosition(vx, vy);
      gfx.setRotation(rd.rotateToAngle ? t.angle : 0);
      // JUMP height fake (docs/design/MOVEMENT_AIR.md): while airborne, scale the WHOLE actor UP on a sine arc
      // (bigger = higher = nearer the camera) — the shadow is shrunk separately inside drawActor. Grounded → 1.
      // A big depth bias lifts airborne actors above grounded ones (they still y-sort among themselves).
      // GEPPO hover: a HELD altitude with a small repeated bob per air-kick — a high base scale + a `hoverT`-phased
      // wobble (reads as "floating, kicking off the air"), instead of the single rise-and-fall of a one-shot jump.
      const mv = e.mover;
      let air = 0;
      if (mv && (mv.fallT ?? 0) > 0 && mv.fallDur) {
        // GEPPO FALL: descend from the hover height → 0 over the fall window (ease-in, so it accelerates down like
        // a real drop) — this is what stops the landing from snapping instantly to the ground.
        const p = 1 - (mv.fallT ?? 0) / mv.fallDur; // 0 → 1 across the fall
        air = (mv.fallFrom ?? GEPPO_HOVER_HEIGHT) * (1 - p * p); // ease-in descent to 0
      } else if (mv?.layer === 'air') {
        if (mv.hovering) {
          // GEPPO: the FIRST kick is a JUMP LAUNCH — ease UP from the ground (0 → hover height) over the first
          // GEPPO_KICK_INTERVAL, so he kicks off the floor instead of snapping straight to hover altitude. AFTER
          // that first kick, settle into the held-high bob (a small wobble around 0.7 per subsequent air-kick).
          const elapsed = mv.hoverElapsed ?? 0;
          const bob = 0.7 + 0.3 * Math.sin((Math.PI * 2 * (mv.hoverT ?? 0)) / GEPPO_KICK_INTERVAL);
          air = elapsed < GEPPO_KICK_INTERVAL
            ? bob * Math.sin((Math.PI / 2) * (elapsed / GEPPO_KICK_INTERVAL)) // launch ramp: 0 → the bob height
            : bob; // settled hover
        } else if (mv.airDur) air = Math.sin(Math.PI * (1 - (mv.airT ?? 0) / mv.airDur)); // a one-shot jump's rise-and-fall
      }
      // SUBMERGE — the inverse of the jump: sinking UNDER the water reads as scaling DOWN (farther from the
      // overhead camera / below the surface), the mirror of a jump's scale-UP. ONLY a full dive shrinks; a
      // SURFACE swim stays normal size (you're at the top of the water, not under it). Mutually exclusive with air.
      const sink = mv?.submerged ? 1 : 0; // fully submerged shrinks; surface swim = normal size
      // PERCHED atop a low wall (and not mid-jump) → a steady step-up — EASED toward its target, so mounting and
      // stepping off the wall GLIDE over ~3τ instead of popping the full ±15% in one frame (first sight = settled).
      const perchTarget = mv?.onLedge && air === 0 ? 1 : 0;
      const prevPerch = this.perchById.get(e.id) ?? perchTarget;
      const perchTau = perchTarget > prevPerch ? LEDGE_EASE_TAU_UP : LEDGE_EASE_TAU_DOWN; // quick up, slow fall down
      const perched = prevPerch + (perchTarget - prevPerch) * (1 - Math.exp(-dt / perchTau));
      this.perchById.set(e.id, perched);
      const animScale = 1 + JUMP_SCALE * air + LEDGE_SCALE * perched - SUBMERGE_SCALE * sink;
      const lift = air > 0 ? AIR_DEPTH_LIFT : 0; // airborne draws above grounded units (nearer the camera)
      const finalAlpha = alpha * (1 - JUMP_FADE * air); // slight translucency at the jump peak — an extra "up" cue
      // publish the body's FINAL presentation channels so worn layers (hat/weapon) mirror all three exactly
      this.scaleById.set(e.id, animScale);
      this.liftById.set(e.id, lift);
      this.alphaById.set(e.id, finalAlpha);
      gfx.setScale(animScale);
      gfx.setDepth(depth + lift);
      gfx.setAlpha(finalAlpha);
      gfx.clear();
      // GOD-MODE AURA (debug tell): a pulsing golden glow UNDER the body so you can SEE the tag is live. Purely
      // presentational — reads the same 'state.godMode' tag the sim gates on, so it follows possession (the
      // Moat: glow whoever you're driving). Drawn FIRST → the body paints over its center. Circle is
      // rotation-invariant, so gfx's aim-rotation doesn't skew it.
      if (e.tags?.has('state.godMode')) drawGodAura(gfx, t.r, now);
      DRAWS[rd.draw]?.(gfx, e, env);
      // SHIPS get a second Graphics for the OVERHEAD rigging (sail/spars/flag): same pose as the hull,
      // depth-lifted past every walker on deck — you walk UNDER the boom, it never paints beneath you
      if (rd.draw === 'ship') {
        let rig = this.rigById.get(e.id);
        if (!rig) {
          rig = this.scene.add.graphics();
          this.rigById.set(e.id, rig);
        }
        rig.setPosition(vx, vy);
        rig.setRotation(rd.rotateToAngle ? t.angle : 0);
        rig.setDepth(depth + RIG_DEPTH_LIFT);
        rig.clear();
        drawShipRig(rig, e, env);
      }
    }
    // orphan sweep: destroy gfx/img for entities that despawned since last frame (sim only calls world.destroy)
    for (const [id, gfx] of this.gfxById) {
      if (!seen.has(id)) {
        gfx.destroy();
        this.gfxById.delete(id);
        this.alphaById.delete(id);
        this.scaleById.delete(id);
        this.liftById.delete(id);
        this.perchById.delete(id);
      }
    }
    for (const [id, img] of this.imgById) {
      if (!seen.has(id)) {
        img.destroy();
        this.imgById.delete(id);
        this.alphaById.delete(id);
        this.scaleById.delete(id);
        this.liftById.delete(id);
        this.perchById.delete(id);
      }
    }
    for (const [id, rig] of this.rigById) {
      if (!seen.has(id)) {
        rig.destroy();
        this.rigById.delete(id);
      }
    }
  }
}
