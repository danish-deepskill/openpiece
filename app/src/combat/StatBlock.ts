import type { Modifier, StatId } from './Modifier';

/** A StatBlock's SAVED state: base values + the modifier list. cache/dirty are derived — never serialized. */
export interface StatBlockSnapshot {
  base: Array<[StatId, number]>;
  mods: Modifier[];
}

/**
 * Base stats + source-tracked modifiers, recomputed lazily. Evaluation order is fixed and order-independent
 * within a tier:  base → +Σflat → ×(1 + ΣaddPct) → ×Π(1 + mulPct) → override.
 *
 * The ONLY place stats are computed. Gear, Devil Fruit, Haki, Fighting Style, Combat Potentials, race,
 * buffs/debuffs, mounts and zones all contribute Modifiers here (by source), so the four combat layers
 * compose without any bespoke stat math scattered across systems.
 */
export class StatBlock {
  private readonly base = new Map<StatId, number>();
  private mods: Modifier[] = [];
  private readonly cache = new Map<StatId, number>();
  private dirty = true;

  constructor(base: Record<StatId, number> = {}) {
    for (const [k, v] of Object.entries(base)) this.base.set(k, v);
  }

  setBase(stat: StatId, value: number): void {
    this.base.set(stat, value);
    this.dirty = true;
  }

  getBase(stat: StatId): number {
    return this.base.get(stat) ?? 0;
  }

  add(mod: Modifier): void {
    this.mods.push(mod);
    this.dirty = true;
  }

  addAll(mods: readonly Modifier[]): void {
    if (mods.length === 0) return;
    this.mods.push(...mods);
    this.dirty = true;
  }

  /** Remove every modifier from a source (unequip / buff expiry / potential removed). */
  removeBySource(source: string): void {
    const before = this.mods.length;
    this.mods = this.mods.filter((m) => m.source !== source);
    if (this.mods.length !== before) this.dirty = true;
  }

  get(stat: StatId): number {
    if (this.dirty) this.recompute();
    return this.cache.has(stat) ? this.cache.get(stat)! : this.getBase(stat);
  }

  /** Every modifier touching a stat — for "where did this number come from" tooltips. */
  explain(stat: StatId): Modifier[] {
    return this.mods.filter((m) => m.stat === stat);
  }

  /** Serializable view (ecs/snapshot): full base map + modifier list, COPIED so the snapshot can't alias
   *  live state. The derived cache/dirty pair is deliberately absent — a restored block recomputes on
   *  first get(), so save data can never carry a stale computed value. */
  snapshot(): StatBlockSnapshot {
    return { base: [...this.base], mods: this.mods.map((m) => ({ ...m })) };
  }

  /** Rebuild from a snapshot — the exact inverse of snapshot(): same base, same mods, cache recomputed. */
  static restore(s: StatBlockSnapshot): StatBlock {
    const sb = new StatBlock();
    for (const [stat, v] of s.base) sb.base.set(stat, v);
    sb.mods = s.mods.map((m) => ({ ...m }));
    return sb;
  }

  private recompute(): void {
    this.cache.clear();
    const ids = new Set<StatId>(this.base.keys());
    for (const m of this.mods) ids.add(m.stat);

    for (const id of ids) {
      let value = this.getBase(id);
      let addPct = 0;
      let mulPct = 1;
      let override: number | undefined;
      for (const m of this.mods) {
        if (m.stat !== id) continue;
        switch (m.op) {
          case 'flat':
            value += m.value;
            break;
          case 'addPct':
            addPct += m.value;
            break;
          case 'mulPct':
            mulPct *= 1 + m.value;
            break;
          case 'override':
            override = m.value;
            break;
        }
      }
      value = value * (1 + addPct) * mulPct;
      if (override !== undefined) value = override;
      this.cache.set(id, value);
    }
    this.dirty = false;
  }
}
