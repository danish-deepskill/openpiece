export type ContentId = string;

export interface Def {
  readonly id: ContentId;
}

/**
 * Generic, typed content registry. One per content family (Fruits, Weapons, Abilities, Items, Zones, …).
 * Systems iterate/lookup registries; adding content = registering a Def, never editing a system.
 * IDs are namespaced strings ('fruit.gomu') → stable saves, debuggable, moddable. Fails fast on
 * duplicate/unknown ids so content bugs surface at boot, not mid-game.
 */
export class Registry<T extends Def> {
  private readonly map = new Map<ContentId, T>();

  constructor(readonly name: string) {}

  register(def: T): T {
    if (this.map.has(def.id)) throw new Error(`${this.name}: duplicate id '${def.id}'`);
    this.map.set(def.id, def);
    return def;
  }

  registerAll(defs: readonly T[]): void {
    for (const d of defs) this.register(d);
  }

  get(id: ContentId): T {
    const d = this.map.get(id);
    if (!d) throw new Error(`${this.name}: unknown id '${id}'`);
    return d;
  }

  has(id: ContentId): boolean {
    return this.map.has(id);
  }

  all(): T[] {
    return [...this.map.values()];
  }

  filter(pred: (d: T) => boolean): T[] {
    return this.all().filter(pred);
  }

  get size(): number {
    return this.map.size;
  }
}
