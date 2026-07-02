# 01 — The Def System: content is data, code is generic

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\` · XML in `..\rimworld-data\`
> Ballpiece mapping: `docs/references/rimworld_patterns.md` §1 → `core/Registry.ts`

## The idea in 3 sentences

Virtually all game content — things, weapons, factions, recipes, hediffs, jobs — lives in XML `Def` rows,
while C# is written generically against Def base types; ~550 XML files in Core alone. The plumbing is a strict
multi-pass boot pipeline: parse XML → resolve inheritance → build def objects → inject cross-references →
resolve derived data → validate loudly. Two supporting tricks make it ergonomic at scale: `DefOf` static
references (typed constants bound by name after load) and short hashes (compact stable ids for saves).

## Key classes

| Class | Path | Role |
|---|---|---|
| `Def` | `Verse\Def.cs` | Base row: `defName`, `label`, lifecycle hooks |
| `DefDatabase<T>` | `Verse\DefDatabase.cs` | Static per-type store: list + by-name dict + by-short-hash dict |
| `XmlInheritance` | `Verse\XmlInheritance.cs` | `ParentName`/`Abstract="True"` template merging (pure XML preprocessing) |
| `DirectXmlCrossRefLoader` | `Verse\DirectXmlCrossRefLoader.cs` | Queues def-typed fields as "wanted refs"; injects live objects later |
| `DefOfHelper` + `[DefOf]` | `RimWorld\DefOfHelper.cs` | Binds static typed fields to defs by field name after load |
| `ShortHashGiver` | via `Verse\PlayDataLoader.cs` | Stable `hash(defName) % 65535` per def for compact saves |
| `PlayDataLoader` | `Verse\PlayDataLoader.cs` | Orchestrates the whole boot pipeline |

## Data flow — the boot pipeline

1. **Parse + inherit.** All mod XML is combined. Nodes with `Name="X"` register as templates; `ParentName="X"`
   children get the parent's resolved node cloned in — child elements overwrite, `<li>` lists **append**
   (note: ballpiece chose lists-*replace* instead), `Inherit="False"` discards parent children.
   `Abstract="True"` templates never instantiate. Cycles detected and logged.
2. **Build objects.** Each node instantiates its def class by tag name. Any field whose type is itself a Def
   subtype is *not* parsed inline — the string is queued as a **wanted cross-reference**. This is why XML can
   say `<projectile>Bullet_Rifle</projectile>` with zero load-order rules.
3. **Register.** `DefDatabase<T>.Add` guards duplicate names, caps at 65535/type, assigns `def.index`.
4. **Resolve cross-refs** (parallel), then **bind DefOfs** — every `[DefOf]` class's static fields get
   `GetDef(fieldType, fieldName)` injected.
5. **`ResolveReferences()`** on every def — the hook for derived data needing *other* defs (order matters:
   ThingCategoryDef first, ThingDef last).
6. **`ConfigErrors()`** on every def — each type yields human-readable complaints; bad data is logged loudly,
   never silently defaulted.

Def lifecycle hooks, in firing order: `PostLoad` (per-object, no cross-refs yet — local caching only) →
`ResolveReferences` (all defs exist) → `ConfigErrors` (validation).

## Patterns used

- **Flyweight** — def = shared immutable data; instances hold only mutable state and a def pointer. The single
  most load-bearing pattern in the codebase (see 16-save-load for the serialization payoff).
- **Registry** — `DefDatabase<T>`, one closed generic per family.
- **Two-phase reference resolution** — strings first, live pointers after all rows exist.
- **Convention-bound constants** — `DefOf` field *name* is the defName; `[MayRequire(modId)]` suppresses
  errors for expansion-only rows.

## Gotchas & clever bits

- Reading a DefOf before binding is a classic bug; `EnsureInitializedInCtor` warns. Rule: resolve well-known
  defs in `ResolveReferences`, never in field initializers.
- Duplicate defNames don't crash — the second gets renamed with a random suffix and an error logged (mod
  tolerance; ballpiece throws instead, which is right for first-party content).
- Short hashes are assigned in defName-sorted order with collision probing — deterministic and save-stable.
- `GetNamed` vs `GetNamedSilentFail`: the loud one is the default; silent lookups are explicit opt-in at call
  sites that can genuinely tolerate absence.
- Implied defs: some defs *generate* other defs (blueprints from buildings, meat from animals) in
  `GenerateImpliedDefs_PreResolve/PostResolve` — content producing content.

## Go deeper

- `Verse\PlayDataLoader.cs` — `DoPlayLoad`: the whole pipeline in one method.
- `Verse\XmlInheritance.cs` — `RecursiveNodeCopyOverwriteElements`: the merge rules.
- `Verse\DirectXmlCrossRefLoader.cs` — `WantedRefForObject` / `ResolveAllWantedCrossReferences`.
- `Verse\DefDatabase.cs` — the three parallel stores and `ErrorCheckAllDefs`.
- `RimWorld\DefOfHelper.cs` — `RebindAllDefOfs`.
- XML example: `..\rimworld-data\Core\Defs\FactionDefs\Factions_Base.xml` — abstract base def as tuning sheet.
