import { Effects } from '../combat/Effect';
import { syncDerivedResources } from '../combat/attributes';
import type { ActiveEffect, Entity } from '../ecs/components';
import type { World } from '../ecs/World';

/** Applies and expires timed effects (their Modifiers + Tags), source-tracked for clean removal. */
export class EffectSystem {
  constructor(private readonly world: World) {}

  apply(e: Entity, effectId: string, by: string): void {
    if (!e.effects) return;
    const d = Effects.get(effectId);
    // merge rule ('refresh' default): reapplying resets the existing instance's clock — its modifiers/tags
    // are already in place, so pushing a second copy would double them
    if ((d.stackRule ?? 'refresh') === 'refresh') {
      const existing = e.effects.active.find((a) => a.id === effectId);
      if (existing) {
        existing.remaining = d.durationSec;
        return;
      }
    }
    // '#seq' makes every instance's source UNIQUE — two stacked instances sharing a source meant the first
    // expiry's removeBySource stripped the survivor's modifiers too (`by` stays purely for explain()/debug)
    const source = `effect:${effectId}:${by}#${e.effects.seq++}`;
    e.effects.active.push({ id: effectId, remaining: d.durationSec, source });
    if (d.modifiers && e.attributes) e.attributes.addAll(d.modifiers.map((m) => ({ ...m, source })));
    if (d.grantTags && e.tags) for (const t of d.grantTags) e.tags.add(t);
    syncDerivedResources(e); // an effect may move maxHp/maxStam — the pools must see the new ceiling now
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
