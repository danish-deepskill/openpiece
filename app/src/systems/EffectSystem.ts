import { Effects } from '../combat/Effect';
import type { ActiveEffect, Entity } from '../ecs/components';
import type { World } from '../ecs/World';

/** Applies and expires timed effects (their Modifiers + Tags), source-tracked for clean removal. */
export class EffectSystem {
  constructor(private readonly world: World) {}

  apply(e: Entity, effectId: string, by: string): void {
    if (!e.effects) return;
    const d = Effects.get(effectId);
    const source = `effect:${effectId}:${by}`;
    e.effects.active.push({ id: effectId, remaining: d.durationSec, source });
    if (d.modifiers && e.attributes) e.attributes.addAll(d.modifiers.map((m) => ({ ...m, source })));
    if (d.grantTags && e.tags) for (const t of d.grantTags) e.tags.add(t);
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
  }
}
