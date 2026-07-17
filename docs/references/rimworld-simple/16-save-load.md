# 16 — Save/Load: the Scribe system

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`
> Openpiece relevance: the design target for persistence (`ARCHITECTURE_SCALE.md`) — serialize-by-id is already canon.

## The idea in 3 sentences

An entire living colony serializes to one XML file through a single convention: every saveable type implements
`IExposable.ExposeData()`, calling `Scribe_*.Look(ref field, "label")` per field. The trick is that
`ExposeData` is written **once but runs in both directions** — a global `Scribe.mode` decides whether each
`Look` writes or reads — so save and load code can never drift apart. Object graphs with cycles are handled by
running the *same* method in three ordered passes: create everything, then resolve references, then rebuild
derived state.

## Key classes

| Class | Role |
|---|---|
| `Scribe` | static mode machine: Saving / LoadingVars / ResolvingCrossRefs / PostLoadInit |
| `IExposable` | the one-method contract used for save AND all three load passes |
| `Scribe_Values` / `_Defs` / `_Deep` / `_References` / `_Collections` | the five primitives (see below) |
| `CrossRefHandler` + `LoadIDsWantedBank` | pass 2: loadID directory + "field X wants object Y" fixup table |
| `PostLoadIniter` | pass 3 registry |
| `ScribeExtractor` | load-side factory: create from node (polymorphic via `Class=` attr), register for passes 2+3 |

## The five primitives — the whole vocabulary

| Primitive | Serializes | Use for |
|---|---|---|
| `Scribe_Values` | inline text | ints, strings, enums |
| `Scribe_Defs` | **defName only** | any def reference |
| `Scribe_Deep` | full subtree | objects you **own** (exactly one owner!) |
| `Scribe_References` | a loadID string | objects someone else owns |
| `Scribe_Collections` | per-element LookMode | lists/dicts of any of the above |

## Data flow

**Save:** one recursive walk from `Scribe_Deep.Look(ref Current.Game, "game")`; the deep-vs-reference decision
*is* the ownership model. Defaults are omitted — saves stay compact.

**Load — three passes over the same ExposeData:**
1. **LoadingVars** — walk XML, `Activator`-create each object, read value fields, recurse deep children;
   reference fields only *record* the wanted loadID (targets may not exist yet).
2. **ResolvingCrossRefs** — every object now registered by loadID; re-run ExposeData; `Scribe_References`
   looks up the real pointer and assigns it.
3. **PostLoadInit** — third run; objects rebuild caches/derived state now that all pointers are live.

Three passes because a save is a graph with cycles and shared references: create all before resolving any
pointer; resolve all before deriving anything.

## The def+instance payoff

`Scribe_Defs` writes only `defName` — 20 muffalos store the string "Muffalo" 20 times, never 20 stat blocks.
Saves stay tiny and **survive game updates and mod changes** (def internals can change freely; only names must
stay resolvable, with a `BackCompatibility` rename map for when they don't). This is the serialization
argument for the def/instance split, independent of the memory argument.

## Gotchas — the ownership rule

Each referenceable object must be deep-saved by **exactly one owner**; everyone else saves a reference.
Deep-saved twice → two independent copies on load, identity silently forks. Referenced but never deep-saved →
"Could not resolve reference", field becomes null. Both violations are *detected*: a dev-mode checker warns at
save time on duplicate/missing loadIDs — the invariant is machine-checked, not tribal knowledge. Also guarded:
deep-saving destroyed things, `Scribe_Values` on def/exposable types, references under value-typed parents.

## Patterns used

Mode-directed symmetric serialization · fixup table for pointer serialization (the classic technique, named) ·
multi-pass visitor reuse · ownership-explicit graph walking.

## Go deeper

- `Verse\ScribeExtractor.cs` `SaveableFromNode` — create→expose→register, + polymorphic type recovery.
- `Verse\CrossRefHandler.cs` + `LoadIDsWantedBank.cs` — the fixup machinery.
- `Verse\ScribeLoader.cs` `FinalizeLoading` — where passes 2 and 3 fire.
- `Verse\ThingWithComps.cs` `ExposeData` — a real example combining all five primitives.
- `Verse\ScribeMetaHeaderUtility.cs` — version/mod header for compatibility checks.
