import { Abilities, abilityRange, type AbilityDef } from '../combat/Ability';
import { angleDiff, dist, norm } from '../core/math';
import { factions } from '../defs/factions';
import type { Entity } from '../ecs/components';
import type { World } from '../ecs/World';
import type { Damage } from './Damage';
import type { EffectSystem } from './EffectSystem';
import type { FxSystem } from './FxSystem';

/** Stamina regenerated per second, shared by every combatant. */
const STAM_REGEN = 16;

/**
 * Resolves abilities for any actor with a `loadout` — the single attack path (the old CombatSystem folded
 * in here). Damage scales off the user's Attributes, so all four combat layers feed one resolution.
 */
export class AbilitySystem {
  constructor(
    private readonly world: World,
    private readonly damage: Damage,
    private readonly fx: FxSystem,
    private readonly effects: EffectSystem,
  ) {}

  /** Decrement cooldowns, regen stamina, and decay combo — for every combatant, not just the player. */
  tick(dt: number): void {
    for (const e of this.world.with('loadout')) {
      const cd = e.loadout!.cd;
      for (const [k, v] of cd) {
        const n = v - dt;
        if (n <= 0) cd.delete(k);
        else cd.set(k, n);
      }
    }
    for (const e of this.world.with('combatant')) {
      const c = e.combatant!;
      if (c.comboT > 0) {
        c.comboT -= dt;
        if (c.comboT <= 0) c.combo = 0;
      }
      if (c.stam < c.maxStam) c.stam = Math.min(c.maxStam, c.stam + STAM_REGEN * dt);
    }
  }

  ready(e: Entity, id: string): boolean {
    const lo = e.loadout;
    if (!lo || !lo.granted.has(id)) return false;
    if ((lo.cd.get(id) ?? 0) > 0) return false;
    const d = Abilities.get(id);
    if (d.minStam && (e.combatant?.stam ?? 0) < d.minStam) return false;
    if (d.blockTags && e.tags && d.blockTags.some((t) => e.tags!.has(t))) return false;
    if (d.requireTags && (!e.tags || !d.requireTags.every((t) => e.tags!.has(t)))) return false;
    return true;
  }

  activate(e: Entity, id: string): boolean {
    if (!this.ready(e, id)) return false;
    const d = Abilities.get(id);
    if (d.costStam && e.combatant) e.combatant.stam = Math.max(0, e.combatant.stam - d.costStam);
    // attack speed is a tier stat: effective recovery = base cooldown / atkSpeed (default 1)
    const atkSpeed = Math.max(0.1, e.attributes?.get('atkSpeed') ?? 1);
    e.loadout!.cd.set(id, d.cooldown / atkSpeed);
    if (d.selfImpulse) this.impulse(e, d.selfImpulse);
    if (d.grantEffect) this.effects.apply(e, d.grantEffect, id);
    if (d.shape) {
      // decide the swing shape here so the animation and the hit match (e.g. 'mixed' → random arc/line)
      const pattern = d.shape.pattern === 'mixed' ? (Math.random() < 0.5 ? 'line' : 'arc') : d.shape.pattern ?? 'arc';
      const line = pattern === 'line';
      if (e.render) {
        e.render.swingT = 0.18;
        e.render.swingMax = 0.18;
        e.render.swingSide = e.equipment?.weapon ? 1 : Math.random() < 0.5 ? -1 : 1; // weapon hand if armed
        e.render.swingArc = !line; // arc → sweep the weapon; line → lunge it forward
        e.render.swingArcHalf = d.shape.arc;
      }
      this.resolveHit(e, d, line);
    }
    return true;
  }

  private impulse(e: Entity, speed: number): void {
    const t = e.transform!;
    const m = e.mover!;
    let dx = m.vx;
    let dy = m.vy;
    if (dx === 0 && dy === 0) {
      dx = Math.cos(t.angle);
      dy = Math.sin(t.angle);
    }
    const [nx, ny] = norm(dx, dy);
    m.dvx = nx * speed;
    m.dvy = ny * speed;
    m.dodgeT = 0.16; // short hop, not a long glide
    this.fx.burst(t.x, t.y, 0xffffff, 8, 160);
  }

  private resolveHit(e: Entity, d: AbilityDef, line: boolean): void {
    const t = e.transform!;
    const shape = d.shape!;
    const mine = e.faction!.id;
    const combo = Math.min(e.combatant?.combo ?? 0, 5);
    const base = (d.damageStat ? e.attributes?.get(d.damageStat) ?? 0 : 0) + (d.damageFlat ?? 0) + combo;
    const range = abilityRange(d, e.attributes?.get('reach') ?? 0); // body reach + weapon bonus (melee)
    const swingType = line ? 'thrust' : shape.swing; // a thrust draws a forward line, not an arc
    const life = shape.swing === 'pistol' ? 0.16 : 0.14;
    this.fx.swing({ type: swingType, x: t.x, y: t.y, angle: t.angle, len: range, life, max: life, arc: shape.arc });

    const fwx = Math.cos(t.angle);
    const fwy = Math.sin(t.angle);
    const halfW = shape.width ?? 12;

    const targets = this.world
      .with('transform', 'health', 'faction')
      .filter((o) => o !== e && !o.ship && !o.health!.dead && factions.isHostile(mine, o.faction!.id))
      .sort((a, b) => dist(t.x, t.y, a.transform!.x, a.transform!.y) - dist(t.x, t.y, b.transform!.x, b.transform!.y));

    for (const o of targets) {
      const ot = o.transform!;
      const rx = ot.x - t.x;
      const ry = ot.y - t.y;
      if (line) {
        // forward corridor: in front, within reach, and close to the aim line
        const proj = rx * fwx + ry * fwy;
        if (proj < 0 || proj > range + ot.r) continue;
        if (Math.abs(rx * -fwy + ry * fwx) > halfW + ot.r) continue;
      } else {
        if (dist(t.x, t.y, ot.x, ot.y) > range + ot.r) continue;
        if (Math.abs(angleDiff(Math.atan2(ry, rx), t.angle)) >= shape.arc) continue;
      }

      // Logia intangibility: the blow phases through unless the attacker has Armament Haki active.
      // (The rock-paper-scissors counter emerges purely from tags — no fruit/haki-specific code.)
      if (o.tags?.has('state.logia.intangible') && !e.tags?.has('haki.armament.active')) {
        this.fx.burst(ot.x, ot.y, 0x9fd0ff, 6, 110);
        if (shape.single) break;
        continue;
      }

      const [nx, ny] = norm(rx, ry);
      const kb = d.knockback ?? 0;
      // `toHero` only tints the floating damage number (red when the hero is hit) — works for any attacker
      this.damage.apply(o, base, nx * kb, ny * kb, !!o.control);
      this.fx.burst((t.x + ot.x) / 2, (t.y + ot.y) / 2, 0xffe08a, 5, 200);
      this.fx.shake(shape.swing === 'pistol' ? 7 : 3);
      if (e.combatant) {
        e.combatant.combo++;
        e.combatant.comboT = 2;
      }
      if (shape.single) break;
    }
  }
}
