import type Phaser from 'phaser';
import { GEPPO_HOVER_HEIGHT, GEPPO_KICK_INTERVAL, Tile } from '../config/constants';
import { draws, type DrawFn } from '../draw/actorDraws';
import { drawShip } from '../draw/shipDraws';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { TileGrid } from '../world/TileGrid';

const WADE_ALPHA = 0.5; // partly submerged — shared by a shallow wade AND surface swimming (same look at the surface)
const SUBMERGED_ALPHA = 0.15; // fully UNDERWATER (dived / sunk) — barely visible below the surface

/** JUMP height fake (docs/design/MOVEMENT_AIR.md): peak scale-up of an airborne actor (bigger = higher). */
const JUMP_SCALE = 0.45;
/** SUBMERGE fake: scale-DOWN of a fully-underwater actor (smaller = deeper/below) — the inverse of the jump. A
 *  gentle dip (→ 0.8×), enough to read as "sunk under" without shrinking to a dot. */
const SUBMERGE_SCALE = 0.2;
/** Peak translucency at the top of a jump (0 = opaque, 0.3 = 30% see-through) — a secondary "airborne" cue. */
const JUMP_FADE = 0.3;
/** Depth bias added to an airborne actor so it draws ABOVE grounded ones (it's nearer the camera). Large enough
 *  to clear any y-sort gap; airborne actors still sort among themselves by their own y. */
const AIR_DEPTH_LIFT = 100000;

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
  private readonly imgById = new Map<number, Phaser.GameObjects.Image>(); // sprite-render entities (Render.sprite)
  /** Computed per-entity alpha this frame (wade/iframe-blink) — AccessorySystem reads it so hats mirror the body. */
  readonly alphaById = new Map<number, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly grid: TileGrid,
  ) {}

  /** The y a unit's layers (body, accessories, weapon) sort by. Normally its own transform.y — but a RIDER
   *  sorts by its SHIP's y (+2, just above the deck), so ALL its layers draw above the hull regardless of the
   *  rider's seat position (else an aft-seated rider's hat/weapon drops under the hull as the boat turns). The
   *  ONE home for this rule; every render layer reads it so they can never disagree. */
  sortY(e: Entity): number {
    if (e.riding) {
      const ship = this.world.byId(e.riding.shipId);
      if (ship?.transform) return ship.transform.y + 2;
    }
    return e.transform!.y;
  }

  update(_dt: number): void {
    const now = this.scene.time.now;
    const seen = new Set<number>();
    for (const e of this.world.with('transform', 'render')) {
      seen.add(e.id);
      const t = e.transform;
      const rd = e.render;
      // SUBMERSION fade: a SWIMMER reads mostly-submerged (the swim STATE, not the tile — mode is the truth);
      // a foot unit wading the shallows reads partly submerged. Riders (pinned to a deck) never submerge.
      let alpha = 1;
      if (!e.riding && e.mover) {
        // SUBMERGED (dived under) reads faint; SURFACE swim (deep OR shallow) reads the SAME as a shallow wade —
        // you're at the top of the water either way, so deep swimming shouldn't look more see-through than wading.
        if (e.mover.submerged) alpha = SUBMERGED_ALPHA;
        else if (e.mover.mode === 'swim' || (e.mover.mode === 'foot' && this.grid.tileAtPx(t.x, t.y) === Tile.ShallowWater)) alpha = WADE_ALPHA;
      }
      // brief invulnerability blink, composed on top of the wade fade
      if (e.health && e.health.iframes > 0 && Math.floor(now / 50) % 2 === 0) alpha *= 0.5;
      this.alphaById.set(e.id, alpha);
      const depth = this.sortY(e) + (rd.depthBias ?? 0); // top-down y-sort (rider layers sort by the ship — sortY)

      if (rd.sprite) {
        // sprite entity: render the item's own loaded texture (e.g. an accessory pickup's art) as an Image
        let img = this.imgById.get(e.id);
        if (!img) {
          img = this.scene.add.image(0, 0, rd.sprite).setOrigin(0.5, 0.5);
          this.imgById.set(e.id, img);
        }
        const dia = t.r * 2 * (rd.spriteScale ?? 1);
        img.setTexture(rd.sprite).setPosition(t.x, t.y).setRotation(rd.rotateToAngle ? t.angle : 0).setDisplaySize(dia, dia).setDepth(depth).setAlpha(alpha);
        continue;
      }

      let gfx = this.gfxById.get(e.id);
      if (!gfx) {
        gfx = this.scene.add.graphics();
        this.gfxById.set(e.id, gfx);
      }
      gfx.setPosition(t.x, t.y);
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
      gfx.setScale(1 + JUMP_SCALE * air - SUBMERGE_SCALE * sink);
      gfx.setDepth(air > 0 ? depth + AIR_DEPTH_LIFT : depth);
      gfx.setAlpha(alpha * (1 - JUMP_FADE * air)); // slight translucency at the peak — an extra "up off the ground" cue
      gfx.clear();
      // GOD-MODE AURA (debug tell): a pulsing golden glow UNDER the body so you can SEE the tag is live. Purely
      // presentational — reads the same 'state.godMode' tag the sim gates on, so it follows possession (the
      // Moat: glow whoever you're driving). Drawn FIRST → the body paints over its center. Circle is
      // rotation-invariant, so gfx's aim-rotation doesn't skew it.
      if (e.tags?.has('state.godMode')) drawGodAura(gfx, t.r, now);
      DRAWS[rd.draw]?.(gfx, e);
    }
    // orphan sweep: destroy gfx/img for entities that despawned since last frame (sim only calls world.destroy)
    for (const [id, gfx] of this.gfxById) {
      if (!seen.has(id)) {
        gfx.destroy();
        this.gfxById.delete(id);
        this.alphaById.delete(id);
      }
    }
    for (const [id, img] of this.imgById) {
      if (!seen.has(id)) {
        img.destroy();
        this.imgById.delete(id);
        this.alphaById.delete(id);
      }
    }
  }
}
