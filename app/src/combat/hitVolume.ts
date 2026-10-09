import { angleDiff, segDist } from '../core/math';
import type { AbilityDef } from './Ability';
import type { ContentId } from '../core/Registry';
import { kitWeapon } from './phases';
import { HAND_R_FRAC, weaponLenOf, type SwingPose } from './swing';
import type { Entity, MeleeSwing } from '../ecs/components';

/**
 * STRIKE VOLUMES — what a melee swing actually damages, decoupled from what it draws. The old model
 * hardcoded "hitbox = the drawn hand→tip segment", which can't express a hammer that only hurts with its
 * head, or a slash whose damaging crescent isn't the steel at all. A strike is a LIST of volumes (they
 * compose: weapon edge AND a wider slash-arc), each independently anchored (to the weapon, or free) and
 * independently TIMED (`active` window on the swing's progress) — so "three hits at three moments in one
 * swing" is data, not engine code. Volumes are still driven by the same swingPose the renderer draws, so
 * determinism and the you-see-what-hits read are preserved; the hitbox just no longer has to BE the blade.
 */

/** One damaging volume of a swing. `active` = the [start, end] window on swing progress p∈[0,1] during
 *  which it is LIVE (default: the whole swing). p is monotonic, so a window opens exactly once per swing —
 *  per-volume hit-sets need no reset machinery. */
export type HitVolume = {
  active?: readonly [number, number];
  /** Scales the ability's damage for hits landed by THIS volume (default 1) — a finisher's crescent hitting
   *  harder than the blade's edge, a flurry's large sweeps hitting double its cuts. Boot-validated > 0. */
  damageMul?: number;
} & (
  /** A span of the DRAWN weapon, `from`→`to` as 0..1 along grip→tip (default the whole weapon; a hammer's
   *  head is {from: 0.85}). `width` overrides the weapon visual's width for this volume. `hand: 'off'` tests the
   *  OFF hand's blade instead (a two-hand motion poses it — SwingPose.off): a cut with two swords is two segments,
   *  each a share (damageMul), so a target caught by both pays full and a clipped one pays half. A one-hand motion
   *  poses no off blade, so such a volume never hits — boot-refused on a one-hand pattern (abilityProblem). */
  | { kind: 'weaponSegment'; from?: number; to?: number; width?: number; hand?: 'lead' | 'off' }
  /** A FREE crescent, decoupled from the blade — the "the slash hits, not the steel" case. A band from
   *  `radius - thickness` out to `radius`, within ±`halfAngle` of its direction. `follow: 'swing'` makes it
   *  travel with the animated cut (pose.drawAngle); 'aim' (default) pins it to the committed attack line —
   *  keep its `active` window short so the burst read stays honest. */
  | { kind: 'arc'; radius: number; halfAngle: number; thickness: number; follow?: 'aim' | 'swing' }
  /** The PATH a launched step travelled — a capsule `width` wide from where the step BEGAN (MeleeSwing.launchX/Y,
   *  recorded at the first cue) to the body NOW. Live only once the step has LANDED (MeleeSystem gates it on
   *  `landed`) and within its window: the cut that lands on everyone he passed, after he is behind them — the
   *  dash-through iai (Rashōmon). A trail row must carry launchAt (abilityProblem). */
  | { kind: 'trail'; width: number }
  // future kinds, documented not built: 'point' (free circle), 'projectile' (spawns a mover; unifies ranged)
);

/** The default default: the whole drawn weapon (bare fist = the fist, via the segment degenerating).
 *  Windowless — MeleeSystem defaults a windowless volume to the swing's ACTIVE phase at read time. */
const WHOLE_WEAPON: readonly HitVolume[] = Object.freeze([{ kind: 'weaponSegment' }]);

/** Synthesized per-jab windows, memoized per (jabs, active-span) — resolution runs per frame, no alloc. */
const jabCache = new Map<string, readonly HitVolume[]>();

/**
 * Resolve the volumes for a swing — the layered-data override chain (same precedence style as the rest of
 * the sim; arrays REPLACE wholesale, never merge — restate a list to change it):
 *   ability.shape.hitVolumes  (may be [] = a visual-only swing)
 *   ?? weapon.hitVolumes      (the weapon's default: a hammer's head, the sword's dead zone — applied ONLY
 *                              to the weapon's OWN kit via kitWeapon: a kick while the sword is sheathed
 *                              must not inherit the blade's dead zone, and Gomu keeps its jab windows)
 *   ?? synthesized            (jabs > 1 → one volume per jab window MAPPED INTO the swing's active span,
 *                              so the flurry pulses exactly while its arms pump; else the whole weapon,
 *                              windowed to the active phase at read time)
 * `activeSpan` = the swing's resolved active phase (combat/phases.activeWindow(melee.phases)).
 */
export function strikeVolumes(e: Entity, d: AbilityDef, activeSpan: readonly [number, number]): readonly HitVolume[] {
  const shape = d.shape!; // callers only resolve volumes for shaped (swinging) abilities
  if (shape.hitVolumes) return shape.hitVolumes;
  // a LIMB motion never inherits the weapon's volumes — a kick granted BY the musket (its slot kit) is still
  // a kick, not the barrel: it synthesizes its own limb volume below
  const kitted = shape.limb ? undefined : kitWeapon(e, d);
  if (kitted?.hitVolumes) return kitted.hitVolumes;
  const jabs = shape.jabs ?? 1;
  if (jabs > 1) {
    const key = `${jabs}|${activeSpan[0]}|${activeSpan[1]}`;
    let vols = jabCache.get(key);
    if (!vols) {
      const [s0, s1] = activeSpan;
      const len = s1 - s0;
      vols = Object.freeze(
        Array.from({ length: jabs }, (_, i): HitVolume => ({ kind: 'weaponSegment', active: [s0 + (i / jabs) * len, s0 + ((i + 1) / jabs) * len] })),
      );
      jabCache.set(key, vols);
    }
    return vols;
  }
  return WHOLE_WEAPON;
}

export type ArcSpec = Omit<Extract<HitVolume, { kind: 'arc' }>, 'active'>;
/** Choreograph a flurry from a PLAN: slice the active span [s0, s1] into plan.length + 1 back-to-back once-per-
 *  target windows (the last = `finisher`), a 'c'/'S' window being the blade, an 'L' window the `large` arc; every
 *  'S' window also cues a volley of `shot` at its start, forward with ±`shotSpread` rad of scatter. The authored twin of the `jabs`
 *  synthesis above — authored because the windows differ; the cut count = the windows (swing.flurryCuts). */
export function flurryWindows(plan: string, s0: number, s1: number, o: { large: ArcSpec; finisher: ArcSpec; shot: ContentId; shotSpread: number }): { hitVolumes: HitVolume[]; volleys: { at: number; ability: ContentId; spread: number }[] } {
  const n = plan.length + 1;
  const w = (s1 - s0) / n;
  const hitVolumes: HitVolume[] = [];
  const volleys: { at: number; ability: ContentId; spread: number }[] = [];
  for (let i = 0; i < plan.length; i++) {
    const active: [number, number] = [s0 + i * w, s0 + (i + 1) * w];
    const k = plan[i];
    if (k !== 'c' && k !== 'L' && k !== 'S') throw new Error(`flurryWindows: unknown plan glyph '${k}' at ${i}`);
    hitVolumes.push(k === 'L' ? { ...o.large, active } : { kind: 'weaponSegment', active });
    if (k === 'S') volleys.push({ at: active[0], ability: o.shot, spread: o.shotSpread });
  }
  hitVolumes.push({ ...o.finisher, active: [s0 + plan.length * w, s1] });
  return { hitVolumes: Object.freeze(hitVolumes) as HitVolume[], volleys: Object.freeze(volleys) as { at: number; ability: ContentId; spread: number }[] }; // frozen like the jab synthesis — defs are shared by every cast
}

/** Boot validation for authored volume lists (fail loud, not a swing that silently never hits). Used by
 *  defs/validateContent over both ability- and weapon-level hitVolumes. */
export function hitVolumeProblem(vols: readonly HitVolume[] | undefined): string | null {
  if (!vols) return null;
  for (const v of vols) {
    if (v.damageMul !== undefined && !(v.damageMul > 0)) return `volume damageMul must be > 0 (got ${v.damageMul})`;
    if (v.active && !(v.active[0] >= 0 && v.active[1] <= 1 && v.active[0] < v.active[1]))
      return `hitVolume active window [${v.active[0]}, ${v.active[1]}] must satisfy 0 ≤ start < end ≤ 1`;
    if (v.kind === 'weaponSegment') {
      const from = v.from ?? 0;
      const to = v.to ?? 1;
      if (!(from >= 0 && to <= 1 && from < to)) return `weaponSegment span [${from}, ${to}] must satisfy 0 ≤ from < to ≤ 1`;
      if (v.width !== undefined && !(v.width > 0)) return `weaponSegment width must be > 0 (got ${v.width})`;
    } else if (v.kind === 'trail') {
      if (!(v.width > 0)) return `trail width must be > 0 (got ${v.width})`;
    } else if (!(v.radius > 0) || !(v.thickness > 0) || !(v.halfAngle > 0)) {
      return 'arc radius/thickness/halfAngle must all be > 0';
    }
  }
  return null;
}

/** Everything volume geometry needs about the attacker THIS frame — built once per swing-frame from the
 *  same pose the renderer draws, then tested per volume per target. */
export interface StrikeFrame {
  x: number; // attacker center (world)
  y: number;
  handX: number; // pose segment endpoints (world): grip → tip
  handY: number;
  tipX: number;
  tipY: number;
  aim: number; // the committed attack angle (MeleeSwing.angle)
  swingAngle: number; // where the ANIMATED cut points this frame (pose.drawAngle — twists through an arc)
  segmentHalfW: number; // default weaponSegment half-width: the weapon visual's, or the bare fist's radius
  fromX: number; // where a launched step BEGAN (the trail volume's origin) — the body itself for an unlaunched swing
  fromY: number;
  /** The OFF hand's blade this frame (world grip → tip), when the motion poses both hands; absent ⇒ no off blade. */
  off?: { handX: number; handY: number; tipX: number; tipY: number };
}

/** Build the frame for a swing — ONE home for this math: MeleeSystem (the hits) and DebugOverlay (the
 *  ground-truth hitbox view) both call it, so the overlay can never drift from what actually connects.
 *  Blade width follows the kitWeapon rule like everything weapon-contributed: a kick thrown while armed
 *  tests with the FIST's radius, not the sheathed blade's. */
export function strikeFrameOf(e: Entity, m: MeleeSwing, d: AbilityDef, pose: SwingPose): StrikeFrame {
  const t = e.transform!; // callers iterate world.with('melee', 'transform')
  // same LIMB rule as strikeVolumes: a slot-kit kick (Shock Kick) tests at the FIST radius, not the barrel's
  // half-width — being granted by the weapon doesn't make a foot a blade
  const wv = d.shape?.limb ? undefined : kitWeapon(e, d)?.visual;
  const o = pose.off;
  const len = o ? weaponLenOf(e) : 0; // the off blade's steel is the same def's (one pair, one length)
  const off = o ? { handX: t.x + o.hx, handY: t.y + o.hy, tipX: t.x + o.hx + Math.cos(o.angle) * len, tipY: t.y + o.hy + Math.sin(o.angle) * len } : undefined;
  return {
    off,
    x: t.x,
    y: t.y,
    handX: t.x + pose.hx,
    handY: t.y + pose.hy,
    tipX: t.x + pose.tx,
    tipY: t.y + pose.ty,
    aim: m.angle,
    swingAngle: pose.drawAngle,
    segmentHalfW: wv ? wv.width / 2 : t.r * HAND_R_FRAC, // blade half-width (the drawn blade IS the hitbox — no fat pad), or the fist radius
    fromX: m.launchX ?? t.x,
    fromY: m.launchY ?? t.y,
  };
}

/** Does `v` overlap the target circle (ox, oy, or) this frame? Pure geometry — headless-tested. */
export function volumeHits(v: HitVolume, f: StrikeFrame, ox: number, oy: number, or: number): boolean {
  if (v.kind === 'weaponSegment') {
    const seg = segmentOf(v, f);
    if (!seg) return false; // an off-blade volume on a frame with no off blade: nothing to hit with
    const halfW = v.width !== undefined ? v.width / 2 : f.segmentHalfW;
    return segDist(ox, oy, seg[0], seg[1], seg[2], seg[3]) <= or + halfW;
  }
  if (v.kind === 'trail') return segDist(ox, oy, f.fromX, f.fromY, f.x, f.y) <= or + v.width / 2; // the path he cut through
  // arc: a crescent band around the attacker, facing the aim or the travelling swing angle
  const dir = v.follow === 'swing' ? f.swingAngle : f.aim;
  const dx = ox - f.x;
  const dy = oy - f.y;
  const d = Math.hypot(dx, dy);
  if (d - or > v.radius) return false; // wholly beyond the outer edge
  if (d + or < v.radius - v.thickness) return false; // wholly inside the inner edge
  // angular test, padded by the target's own angular size so a big body clipped by the crescent still counts
  const pad = d > 0.001 ? Math.asin(Math.min(1, or / d)) : Math.PI;
  return Math.abs(angleDiff(Math.atan2(dy, dx), dir)) <= v.halfAngle + pad;
}

/** The world segment a weaponSegment volume tests this frame — the lead blade's span, or the off blade's for `hand:
 *  'off'` (undefined when the frame has no off blade). ONE home: MeleeSystem's test and DebugOverlay's draw both read it. */
export function segmentOf(v: Extract<HitVolume, { kind: 'weaponSegment' }>, f: StrikeFrame): [number, number, number, number] | undefined {
  const from = v.from ?? 0;
  const to = v.to ?? 1;
  const b = v.hand === 'off' ? f.off : { handX: f.handX, handY: f.handY, tipX: f.tipX, tipY: f.tipY };
  if (!b) return undefined;
  return [b.handX + (b.tipX - b.handX) * from, b.handY + (b.tipY - b.handY) * from, b.handX + (b.tipX - b.handX) * to, b.handY + (b.tipY - b.handY) * to];
}

/** N equal blade-cut windows tiling the ACTIVE phase (the flurry rule: the windows ARE the cuts) — a double cut is
 *  cutWindows(2, phases). One source with the row's phases, so the cuts can never drift off the swing's clock. Under a
 *  PAIR hold the cuts alternate hands (swing.activeSide): window 0 the lead blade, window 1 the off blade. Frozen, like
 *  flurryWindows: defs are shared by every cast. */
export function cutWindows(n: number, ph: { windup: number; active: number }): HitVolume[] {
  const out: HitVolume[] = [];
  const w = ph.active / n;
  for (let i = 0; i < n; i++) out.push({ kind: 'weaponSegment', active: [ph.windup + i * w, ph.windup + (i + 1) * w] });
  return Object.freeze(out) as HitVolume[]; // readonly at runtime; the HitVolume[] type is what the row fields take
}
