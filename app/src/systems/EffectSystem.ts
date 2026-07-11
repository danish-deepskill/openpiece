import { applyEffect, Effects } from '../combat/Effect';
import { syncDerivedResources } from '../combat/attributes';
import type { ActiveEffect, Entity } from '../ecs/components';
import type { World } from '../ecs/World';

/** TICKS and EXPIRES timed effects (their Modifiers + Tags), source-tracked for clean removal. APPLICATION
 *  lives in combat/Effect.applyEffect — a standalone fn, because services (StrikeResolver's hitstun, guard
 *  breaks, the wall-slam) apply effects too and injecting this system everywhere was the wrong coupling. */
export class EffectSystem {
  constructor(private readonly world: World) {}

  /** System-facing façade for existing callers — delegates to the ONE application path (combat/Effect). */
  apply(e: Entity, effectId: string, by: string, dur?: number): void {
    applyEffect(e, effectId, by, dur);
  }

  update(dt: number): void {
    for (const e of this.world.with('effects')) {
      const arr = e.effects!.active;
      for (let i = arr.length - 1; i >= 0; i--) {
        const a = arr[i];
        a.remaining -= dt;
        if (a.remaining <= 0) {
          arr.splice(i, 1);
          this.expire(e, a, arr);
        }
      }
    }
  }

  private expire(e: Entity, a: ActiveEffect, remaining: ActiveEffect[]): void {
    const d = Effects.get(a.id);
    if (d.modifiers && e.attributes) e.attributes.removeBySource(a.source);
    if (d.grantTags && e.tags) {
      for (const t of d.grantTags) {
        const stillGranted = remaining.some((o) => Effects.get(o.id).grantTags?.includes(t));
        if (!stillGranted) e.tags.remove(t);
      }
    }
    syncDerivedResources(e); // a maxHp/maxStam buff just ended — clamp the pools to the restored ceiling
  }
}
