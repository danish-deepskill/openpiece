import { Abilities } from '../combat/Ability';
import { canClash, CLASH_BIND_HOLD, CLASH_FLING, CLASH_OVERPOWER_HOLD, EFFECT_OVERPOWERED, CLASH_PAD, CLASH_POSTURE, CLASH_SHOVE, CLASH_SPARK_EVERY, EFFECT_BLADE_LOCK, LOCK_GRACE, judgeClash, type ClashVerdict } from '../combat/clash';
import { REBOUND_STUN, ruleFor, tierGap } from '../combat/dominance';
import { applyEffect, endEffect, TAG_RAGDOLL } from '../combat/Effect';
import { launchRagdoll } from '../combat/ragdoll';
import { damagePosture } from '../combat/guard';
import { segmentOf, strikeFrameOf, strikeVolumes, volumeHits, type StrikeFrame } from '../combat/hitVolume';
import { FX_COLOR, KNOCKBACK_CARRY } from '../config/constants';
import { segDist, segSegClosest } from '../core/math';
import { Rng } from '../core/Rng';
import { abilityReach, swingGeomOf, swingPose } from '../combat/swing';
import { fxThemeOf } from '../combat/fxTheme';
import { entityHostile, harmableBy } from '../combat/targeting';
import { events } from '../core/EventBus';
import type { Entity, MeleeSwing } from '../ecs/components';
import type { World } from '../ecs/World';
import { leapBack } from './MovementSystem';
import type { StrikeResolver } from './StrikeResolver';
import { SpatialQuery } from '../world/SpatialQuery';
import { TAG_STUNNED } from '../combat/Effect';

/** Airborne window (s) for an on-hit recoil LEAP (the Shock Kick's jump-back). Matches the jump feel — long
 *  enough to read as a hop-arc, short enough to snap back to firing quickly. The DISTANCE is the ability's
 *  recoilPush (px/s over this window); tune reach there, arc duration here. */
const RECOIL_LEAP_DUR = 0.45;

/**
 * Resolves melee by CONTACT. While a `melee` swing is active, its resolved strike volumes
 * (combat/hitVolume — the weapon span, a free slash-arc, …) are moving hitboxes, each live only within its
 * `active` window of the swing; the frame one overlaps a hostile, the hit lands (once per volume — two
 * volumes may deliberately both connect). The same swing drives the animation (drawActor → swingPose), so
 * what you see drives what hits — a swing the target steps out of simply whiffs. One engine: player and AI
 * both attack this way. The hit itself is delegated to StrikeResolver; this system owns only the geometry.
 */
/** How long the drawn line of a 'trail' cut lingers after it fires (presentation; the hit itself is one tick). */
const TRAIL_FX_LIFE = 0.4;
/** One live blade segment this tick: [ax, ay, bx, by, halfWidth] (world px). */
type BladeSeg = [number, number, number, number, number];
/** Clash pre-check (px): two swinging bodies farther apart than this on either axis can't have blades touching — the
 *  longest blade + reach is well under it. Skips the segment geometry for the far pairs. */
const CLASH_GATE = 160;

export class MeleeSystem {
  // query DEFAULTED so standalone tests stand unchanged; the scene passes its SHARED instance (audit M1:
  // every neighbor enumeration through the one chokepoint — the future grid swap must share one index)
  constructor(
    private readonly world: World,
    private readonly strikes: StrikeResolver,
    private readonly query: SpatialQuery = new SpatialQuery(world),
    private readonly rng: Rng = new Rng(1), // the clash's equals-roll (combat/clash) — the scene injects the shared combat stream; tests take the seeded default
  ) {}

  update(dt: number): void {
    // THREE PASSES, one clock: every swing advances first, then steel-meets-steel is judged on this tick's geometry, then
    // hits resolve for the swings still standing. (Advancing and resolving per entity in one pass let A's hit cancel B
    // before B had moved this tick — and gave the clash no tick where both blades were in their new places.)
    const swinging: Entity[] = [];
    for (const e of [...this.world.with('melee', 'transform')]) {
      const m = e.melee;
      if (!m) continue; // a hit earlier this same frame may have cancelled this swing (hitstun) — skip it
      if (m.lock) {
        this.tickLock(e, m, dt); // a LOCKED swing holds: clock paused, pose pinned, the verdict lands when the hold ends
        continue;
      }
      if (e.tags?.has(TAG_STUNNED)) {
        // a FROZEN body swings nothing: a stun (the wall-slam's electrified pin, a future freeze) ends any swing in
        // flight — else a six-second channel kept cutting and loosing slashes while its owner stood paralysed
        delete (e as Entity).melee;
        continue;
      }
      m.t += dt;
      swinging.push(e);
    }
    if (swinging.length > 1) this.clashes(swinging);
    for (const e of swinging) {
      const m = e.melee;
      if (!m || m.lock) continue; // lost its swing to a clash this tick — or HELD in one: a locked blade cuts nobody
      this.resolve(e);
      // detach: presence-as-state (widen past the narrowing) — but HOLD a launched swing whose landing
      // AoE hasn't fired yet (long knockback can outlive the swing; AbilitySystem fires the slam, then this frees)
      if (m.t >= m.dur && !((m.launches ?? 0) > 0 && !m.landed)) delete (e as Entity).melee;
    }
  }

  /** STEEL MEETS STEEL (combat/clash): for every hostile pair of swinging bodies whose LIVE blade segments overlap this tick,
   *  judge the clash and apply it — the loser's swing is lost (staggered, shoved, posture paid); a bind costs both. One pass
   *  over the few bodies mid-swing; the cheap distance gate first, the segment geometry only for near pairs. */
  private clashes(swinging: Entity[]): void {
    for (let i = 0; i < swinging.length; i++) {
      const a = swinging[i]!; // index-bounded by the loop
      if (!a.melee) continue;
      let sa: BladeSeg[] | undefined; // a's live blades, computed once for all its partners (only if a near, coated enemy appears)
      for (let j = i + 1; j < swinging.length; j++) {
        const b = swinging[j]!; // index-bounded by the loop
        if (!a.melee || !b.melee) continue;
        const at = a.transform!; // swinging bodies come from with('melee', 'transform')
        const bt = b.transform!;
        if (Math.abs(at.x - bt.x) > CLASH_GATE || Math.abs(at.y - bt.y) > CLASH_GATE) continue;
        if (!entityHostile(a, b) || !canClash(a, b)) continue; // enemies, both coated — steel rings only between haki
        sa ??= this.liveBlades(a);
        if (sa.length === 0) break; // a has nothing live this tick — no partner can ring with it
        const sb = this.liveBlades(b);
        if (sb.length === 0) continue;
        // 1) steel TOUCHES steel: any live segment of a within reach of any live segment of b
        let hit: { x: number; y: number } | undefined;
        for (const p of sa) {
          for (const q of sb) {
            const c = segSegClosest(p[0], p[1], p[2], p[3], q[0], q[1], q[2], q[3]);
            if (c.d <= p[4] + q[4] + CLASH_PAD) { hit = c; break; }
          }
          if (hit) break;
        }
        // 2) the MUTUAL BLOW: a's blade is on b's body AND b's blade is on a's body this tick — two cuts arriving together
        //    meet in the middle rather than trade (the clash happens where the two lines between them cross: halfway)
        if (!hit && this.bladeOn(sa, bt.x, bt.y, bt.r) && this.bladeOn(sb, at.x, at.y, at.r)) hit = { x: (at.x + bt.x) / 2, y: (at.y + bt.y) / 2 };
        if (!hit) continue;
        this.applyClash(a, b, hit.x, hit.y, judgeClash(a, b, this.rng));
      }
    }
  }

  /** One tick of a held lock: sparks trickle from the crossing; a body flung out of the lock (ragdolled) loses it with no
   *  recoil (the fall is punishment enough, and a recoil on a flying body is nonsense); at zero the verdict lands — the
   *  loser's recoil, or the winner's clock resuming. The Bind effect is ended HERE, by the same tick that ends the hold. */
  private tickLock(e: Entity, m: MeleeSwing, dt: number): void {
    const lock = m.lock!; // callers checked
    if (e.tags?.has(TAG_RAGDOLL)) {
      endEffect(e, EFFECT_BLADE_LOCK);
      delete e.melee;
      return;
    }
    lock.t -= dt;
    if (lock.emits) {
      lock.spark -= dt;
      if (lock.spark <= 0) {
        lock.spark += CLASH_SPARK_EVERY;
        events.emit('fx:burst', { x: lock.x, y: lock.y, color: FX_COLOR.parry, n: 3, speed: 150, theme: fxThemeOf(e) });
      }
    }
    if (lock.t > 0) return;
    endEffect(e, EFFECT_BLADE_LOCK);
    if (!lock.loser) delete m.lock; // the stronger blade carries on from where it was held
    else if (lock.bind) this.recoil(e, lock.x, lock.y); // a tie: both stumble back
    else this.fling(e, lock.x, lock.y); // overpowered: flung and down
  }

  /** A BIND's recoil on one body: the rebound stagger, the swing lost, posture paid, a stumble back from the contact point. */
  private recoil(l: Entity, x: number, y: number): void {
    applyEffect(l, 'effect.staggered', 'clash', REBOUND_STUN);
    delete l.melee;
    damagePosture(l, CLASH_POSTURE);
    const lt = l.transform!; // a clash participant is a placed body (the clash pass iterated with('melee', 'transform'))
    const m = l.mover;
    if (m && !l.tags?.has(TAG_RAGDOLL)) {
      const away = Math.atan2(lt.y - y, lt.x - x);
      m.dvx = Math.cos(away) * CLASH_SHOVE;
      m.dvy = Math.sin(away) * CLASH_SHOVE;
      m.dodgeT = Math.max(m.dodgeT, KNOCKBACK_CARRY);
    }
  }

  /** An OVERPOWER's recoil on the loser: the swing lost, posture paid, and the body FLUNG along the line away from the contact
   *  — the ragdoll's flight and downed beat (its own stun; no stagger on top). A body already flying is not re-launched. */
  private fling(l: Entity, x: number, y: number): void {
    delete l.melee;
    damagePosture(l, CLASH_POSTURE);
    const lt = l.transform!; // a clash participant is a placed body (the clash pass iterated with('melee', 'transform'))
    if (!l.mover || l.tags?.has(TAG_RAGDOLL)) return;
    const away = Math.atan2(lt.y - y, lt.x - x);
    launchRagdoll(l, Math.cos(away), Math.sin(away), CLASH_FLING.force, CLASH_FLING.airTime, CLASH_FLING.downed, this.rng.next(), EFFECT_OVERPOWERED);
  }

  /** Is any of these live blade segments on the body (ox, oy, or) — would it land this tick? */
  private bladeOn(segs: BladeSeg[], ox: number, oy: number, or: number): boolean {
    for (const sg of segs) if (segDist(ox, oy, sg[0], sg[1], sg[2], sg[3]) <= or + sg[4]) return true;
    return false;
  }

  /** The LIVE blade segments of a swinging body this tick — the lead blade and, for a pair, the off blade — each as
   *  [ax, ay, bx, by, halfWidth]. Only weaponSegment volumes whose window is open count: a sheathed blade (Rashōmon's pass),
   *  a wind arc or a trail is not steel that can ring. Empty for a noHit or a shot swing. */
  private liveBlades(e: Entity): BladeSeg[] {
    const m = e.melee!; // callers pass a swinging body
    const d = Abilities.get(m.ability);
    const shape = d.shape!; // a swing exists only for a shaped ability (startSwing)
    const out: BladeSeg[] = [];
    if (shape.noHit || m.motion === 'shot' || m.lock) return out; // a held blade is already in a lock — it rings once
    const w0 = m.phases.windup;
    const aEnd = w0 + m.phases.active;
    const p = m.dur > 0 ? Math.min(1, m.t / m.dur) : 1;
    let frame: StrikeFrame | undefined;
    for (const v of strikeVolumes(e, d, [w0, aEnd])) {
      if (v.kind !== 'weaponSegment') continue;
      const a0 = v.active ? v.active[0] : w0;
      const a1 = v.active ? v.active[1] : aEnd;
      if (p < a0 || p > a1) continue;
      frame ??= strikeFrameOf(e, m, d, swingPose(m, shape, swingGeomOf(e)));
      const seg = segmentOf(v, frame);
      if (!seg) continue;
      out.push([seg[0], seg[1], seg[2], seg[3], v.width !== undefined ? v.width / 2 : frame.segmentHalfW]);
    }
    return out;
  }

  /** Apply a clash verdict at the contact point: both bodies enter the BLADE LOCK — held with blades crossed (the Bind effect
   *  freezes them, the swing clocks pause) for the hold, after which the recoil lands on the loser (both, in a bind) and a
   *  winner's cut resumes (tickLock). The clang itself is now: the readout event names the rung and the outcome, one big
   *  spark at the crossing, themed if either blade is coated. */
  private applyClash(a: Entity, b: Entity, x: number, y: number, verdict: ClashVerdict): void {
    const hold = verdict.kind === 'bind' ? CLASH_BIND_HOLD : CLASH_OVERPOWER_HOLD;
    for (const e of [a, b]) {
      const loser = verdict.kind === 'bind' || verdict.loser === e;
      e.melee!.lock = { t: hold, hold, x, y, loser, bind: verdict.kind === 'bind', emits: e === a, spark: CLASH_SPARK_EVERY }; // both are swinging (the clash pass found their live blades)
      applyEffect(e, EFFECT_BLADE_LOCK, 'clash', hold + LOCK_GRACE); // the freeze; the melee tick ends it, never the effect clock
    }
    const gap = tierGap(a, b) ?? 0;
    const theme = fxThemeOf(a) ?? fxThemeOf(b);
    events.emit('fx:burst', { x, y, color: FX_COLOR.parry, n: verdict.kind === 'bind' ? 18 : 12, speed: 280, theme });
    events.emit('fx:shake', { amount: verdict.kind === 'bind' ? 4 : 3 });
    events.emit('combat:clash', { x, y, gap, rule: ruleFor(gap), outcome: verdict.kind });
  }

  private resolve(e: Entity): void {
    const m = e.melee!; // callers pass a swinging body
    const d = Abilities.get(m.ability);
    const shape = d.shape!; // a swing exists only for a shaped ability (startSwing)
    if (shape.noHit) return; // visual-only swing (Gomu Rocket's grab) — its damage is the landing AoE, not contact

    // the swing's ACTIVE phase (resolved at cast): windowless volumes are live exactly here — an attack
    // deals no damage during its windup (the tell) or its recovery (the punish window)
    const phaseStart = m.phases.windup;
    const phaseEnd = m.phases.windup + m.phases.active;
    const volumes = strikeVolumes(e, d, [phaseStart, phaseEnd]); // ability ?? kit weapon ?? synthesized (memoized — no alloc)
    if (volumes.length === 0) return; // authored visual-only ([]) — nothing to test
    const p = m.dur > 0 ? Math.min(1, m.t / m.dur) : 1; // swing progress gates each volume's active window

    const pose = swingPose(m, shape, swingGeomOf(e)); // the SAME geom the renderer uses — you see what hits
    const frame = strikeFrameOf(e, m, d, pose); // shared with DebugOverlay — the overlay IS this geometry

    const canHit = harmableBy(e);
    const base = this.strikes.baseDamage(e, d);
    const kb = d.knockback ?? 0;
    const kx = Math.cos(m.angle) * kb; // knock targets along the attack direction (forward)
    const ky = Math.sin(m.angle) * kb;

    for (let vi = 0; vi < volumes.length; vi++) {
      const v = volumes[vi];
      const a0 = v.active ? v.active[0] : phaseStart; // authored windows stay ABSOLUTE (whole-swing fractions);
      const a1 = v.active ? v.active[1] : phaseEnd; //   windowless volumes inherit the active phase
      if (p < a0 || p > a1) continue; // this volume isn't live yet / anymore (p is monotonic — no reset needed)
      if (v.kind === 'trail' && !m.landed) continue; // the path is cut once the step has ENDED — he is behind them before it lands
      let hits = m.hitByVolume[vi];
      if (!hits) {
        hits = m.hitByVolume[vi] = []; // per-volume once-only set (volumes may deliberately double-dip)
        // a TRAIL's first live tick IS the cut: draw the line he ran, from the step's origin to where he stands (a fixed
        // world line — it does not follow him), themed like every cut a coated body makes
        if (v.kind === 'trail') {
          const dx = frame.x - frame.fromX;
          const dy = frame.y - frame.fromY;
          events.emit('fx:swing', { type: 'trail', x: frame.fromX, y: frame.fromY, angle: Math.atan2(dy, dx), len: Math.hypot(dx, dy), life: TRAIL_FX_LIFE, max: TRAIL_FX_LIFE, enemy: !e.control, thin: v.width < 30, theme: fxThemeOf(e) });
        }
      }
      // candidates via the SPATIAL CHOKEPOINT (audit M1), not a full-world walk. The cut is conservative
      // on purpose — ability reach ×1.5 + a fat pad covers every volume offset + the widest body; the
      // exact volumeHits test below still decides. within() (not forEachWithin): the loop needs `return`
      // for the parry-cancel and single-hit exits, and the candidate list is small.
      const et = e.transform!;
      const probe = abilityReach(e, d) * 1.5 + 120;
      const candidates = this.query.within(et.x, et.y, probe, (o) => !!o.health && !!o.faction);
      for (const o of candidates) {
        if (!canHit(o) || hits.includes(o.id)) continue; // shared harm predicate (enemies + huntable wildlife)
        const ot = o.transform!;
        if (!volumeHits(v, frame, ot.x, ot.y, ot.r)) continue; // steel/slash hasn't reached them yet
        hits.push(o.id); // count the contact even if it phases (Logia), so it isn't re-tested every frame
        const landed = this.strikes.hit(e, o, d, base * (v.damageMul ?? 1), kx, ky, d.shake ?? 0, d.stun ?? 0); // this VOLUME's share of the ability's damage
        // ON-HIT LEAP-BACK (the Shock Kick's shove-off): only when the kick CONNECTS does the kicker jump
        // backward (a whiff = no free escape). A jump-style hop (air arc), not a flat slide — see leapBack.
        if (landed && d.recoilPush && e.mover && !m.leaptBack) {
          m.leaptBack = true; // once per swing (a multi-volume kick can't double-launch)
          leapBack(e.mover, m.angle, d.recoilPush, RECOIL_LEAP_DUR);
        }
        if (!e.melee) return; // a PARRY cancelled this swing mid-resolve — the deflected cut reaches nobody else
        if (shape.single) return; // one landed hit per frame — same behavior the single-volume model had
      }
    }
  }
}
