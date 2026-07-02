export type ContentId = string;

export interface Def {
  readonly id: ContentId;
  /**
   * Optional base def to inherit from. The resolved def is `{ ...parent, ...this }` — this def's fields win;
   * arrays/objects are REPLACED (not deep-merged), so restate a list to change it. Chains through grandparents.
   * Lets a whole variant line (gold/diamond cutlass) be deltas off one base instead of copies.
   */
  readonly parent?: ContentId;
}

/** Returns a problem string if `def` is invalid (→ throws at boot), or null if it's fine. */
export type Validator<T> = (def: T) => string | null;

/**
 * Generic, typed content registry. One per content family (Fruits, Weapons, Abilities, Items, Zones, …).
 * Systems iterate/lookup registries; adding content = registering a Def, never editing a system.
 * IDs are namespaced strings ('fruit.gomu') → stable saves, debuggable, moddable.
 *
 * Two scaling features, applied lazily on first access (so registration order doesn't matter):
 *  - **Inheritance** — a def's `parent` chain is flattened (child overrides; arrays replace).
 *  - **Validation** — an optional `validate` fn runs on every resolved def. Both fail FAST + LOUD at boot
 *    (unknown/duplicate/cyclic id, unknown parent, invalid def) so content bugs surface on load, not mid-game.
 */
/** Id grammar (DESIGN_PATTERNS §3): `<family>.<camelCaseSlug>` — 'ability.gomuPistol', 'accessory.strawHat'. */
const ID_GRAMMAR = /^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/;

export class Registry<T extends Def> {
  private readonly raw = new Map<ContentId, T>(); // as registered
  private readonly resolved = new Map<ContentId, T>(); // inheritance-flattened + validated (lazy)
  private finalized = false;

  constructor(
    readonly name: string,
    private readonly validate?: Validator<T>,
  ) {}

  register(def: T): T {
    if (!ID_GRAMMAR.test(def.id))
      throw new Error(`${this.name}: id '${def.id}' violates the grammar <family>.<camelCaseSlug>`);
    if (this.raw.has(def.id)) throw new Error(`${this.name}: duplicate id '${def.id}'`);
    this.raw.set(def.id, def);
    this.finalized = false; // a new def can change inheritance resolution → re-resolve on next access
    this.resolved.clear();
    return def;
  }

  registerAll(defs: readonly T[]): void {
    for (const d of defs) this.register(d);
  }

  get(id: ContentId): T {
    this.ensure();
    const d = this.resolved.get(id);
    if (!d) throw new Error(`${this.name}: unknown id '${id}'`);
    return d;
  }

  has(id: ContentId): boolean {
    return this.raw.has(id);
  }

  all(): T[] {
    this.ensure();
    return [...this.resolved.values()];
  }

  filter(pred: (d: T) => boolean): T[] {
    return this.all().filter(pred);
  }

  get size(): number {
    return this.raw.size;
  }

  /** Flatten every def's parent chain and validate — once, on first access. Throws loud on any bad def. */
  private ensure(): void {
    if (this.finalized) return;
    for (const id of this.raw.keys()) this.resolveOne(id, new Set());
    this.finalized = true;
  }

  /** Resolve one def: merge its parent chain (child wins; arrays replace), strip `parent`, validate. Memoized. */
  private resolveOne(id: ContentId, seen: Set<ContentId>): T {
    const cached = this.resolved.get(id);
    if (cached) return cached;
    if (seen.has(id)) throw new Error(`${this.name}: cyclic 'parent' chain through '${id}'`);
    const def = this.raw.get(id);
    if (!def) throw new Error(`${this.name}: unknown id '${id}'`);

    let merged: T = def;
    if (def.parent !== undefined) {
      if (!this.raw.has(def.parent)) throw new Error(`${this.name}: '${id}' extends unknown parent '${def.parent}'`);
      seen.add(id);
      const parent = this.resolveOne(def.parent, seen);
      merged = { ...parent, ...def, parent: undefined } as T; // child wins; drop the lineage marker
    }

    const problem = this.validate?.(merged);
    if (problem) throw new Error(`${this.name}: invalid def '${id}': ${problem}`);

    this.resolved.set(id, merged);
    return merged;
  }
}
