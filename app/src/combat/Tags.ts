/**
 * Hierarchical gameplay tags (dot-namespaced), e.g. `fruit.type.zoan`, `haki.armament.active`,
 * `state.logia.intangible`, `cc.feared`, `weapon.class.heavy`, `mode.ship.battle`.
 *
 * Tags drive conditions, immunities, counters (an Armament-tagged hit bypasses `state.logia.intangible` —
 * Haki countering Devil Fruits), ability requirements, and AI reads — without bespoke booleans per feature.
 */
export class TagSet {
  private readonly tags = new Set<string>();

  add(tag: string): void {
    this.tags.add(tag);
  }

  remove(tag: string): void {
    this.tags.delete(tag);
  }

  has(tag: string): boolean {
    return this.tags.has(tag);
  }

  /** True if any tag equals `prefix` or sits under it (`fruit.type` matches `fruit.type.zoan`). */
  hasPrefix(prefix: string): boolean {
    for (const t of this.tags) {
      if (t === prefix || t.startsWith(prefix + '.')) return true;
    }
    return false;
  }

  all(): string[] {
    return [...this.tags];
  }
}
