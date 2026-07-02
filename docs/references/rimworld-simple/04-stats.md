# 04 — Stats: one pipeline, every number explained

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`
> Ballpiece mapping: `docs/references/rimworld_patterns.md` §2 → `combat/StatBlock.ts` + `Modifier.ts`

## The idea in 3 sentences

Every queryable number on anything — move speed, market value, melee hit chance — is a `StatDef`, and one
generic `StatWorker` computes it through a fixed pipeline: base value → **all additive offsets** → **all
multiplicative factors** → pluggable `StatPart`s → post-process curve → rounding → clamp. Every source that can
touch a stat (gear, traits, hediffs, skills, genes, precepts) contributes to exactly one of those buckets, in
the same order every time. The killer feature is the **explanation mirror**: every mutation path has a twin
that emits a labeled line, so the UI can always answer "why is this value X".

## Key classes

| Class | Path | Role |
|---|---|---|
| `StatDef` | `RimWorld\StatDef.cs` | The stat as data: default base, min/max, curve, parts, display, `workerClass` |
| `StatWorker` | `RimWorld\StatWorker.cs` | The generic pipeline: `GetValueUnfinalized` + `FinalizeValue` + explanations |
| `StatModifier` | `RimWorld\StatModifier.cs` | One (stat, value) entry in a def's offset/factor list |
| `StatPart` (~90 subclasses) | `RimWorld\StatPart*.cs` | Pluggable per-stat contribution: quality, health %, age curve, pain… |
| `StatRequest` | `RimWorld\StatRequest.cs` | Parameter object: the thing/def/stuff being asked about |
| `StatCacheEntry` | `RimWorld\StatCacheEntry.cs` | Cached value + the tick it was computed |

## Data flow — `GetValue(req)`

1. **Base**: `defaultBaseValue`, overridden by the def's `statBases` list.
2. **Offsets (+=)**: skill needs → capacities → traits → hediff stages → precepts → genes → life stage →
   worn gear (`equippedStatOffsets`) + weapon.
3. **Factors (×=)**: the same source families' factor lists, then stuff (material), then comps, then
   `statFactors` (other stats multiplied in), then inspiration.
4. **Finalize**: each `StatPart.TransformValue` in priority order → `postProcessCurve` →
   `postProcessStatFactors` → scenario factor → rounding → `Clamp(min, max)`.

Explanations run the *same walk* emitting labeled lines (`GetExplanationUnfinalized`,
`GetOffsetsAndFactorsExplanation`) — base, then one line per contributor, then per-part `ExplanationPart`,
then the curve as `x => y`. If a mutation exists without its explanation twin, the info card lies; keeping
them adjacent in one class is the discipline.

## Patterns used

- **Def + worker strategy** — `StatDef.workerClass` (default `StatWorker`), instantiated lazily.
- **Offsets-then-factors** — a two-bucket stacking order (ballpiece's `flat → addPct → mulPct → override` is
  the same idea with a finer vocabulary).
- **Pluggable parts** — `StatPart` = per-stat Strategy list, priority-sorted at `PostLoad`.
- **Tolerated-staleness caching** — `GetValue(thing, cacheStaleAfterTicks)`: caller declares how stale is
  acceptable; immutable stats (proven never-modified) cache forever in a separate dictionary.

## Gotchas & clever bits

- **Stats are defs**, so adding a stat is a data row; `PopulateMutableStats` scans all content defs at boot to
  learn which stats can *ever* be modified — everything else is provably immutable and cached hard.
- Curves live in data (`postProcessCurve`) — diminishing returns tuned in XML, not code.
- Factors can reference **other stats** (`statFactors`) — stat composition without special cases.
- Cache invalidation is two-tier: a global per-frame clear plus targeted `ClearCacheForThing` on known
  mutations. The caller-declared staleness (`cacheStaleAfterTicks`) is what makes hot loops cheap.
- `applyFactorsIfNegative` — a subtle flag guarding factor application when the running value is below zero.

## Go deeper

- `RimWorld\StatWorker.cs` :100 `GetValueUnfinalized`, :791 `FinalizeValue`, :403 `GetExplanationUnfinalized`,
  :1158 `StatOffsetFromGear` — the whole engine is one file.
- `RimWorld\StatDef.cs` :148 lazy `Worker`, :280 `PopulateMutableStats`, :433 `SetImmutability`.
- `RimWorld\StatPart_Quality.cs`, `StatPart_Health.cs` (curve-based), `StatPart_Pain.cs` — three part shapes.
- `RimWorld\StatModifier.cs` — `ValueToStringAsOffset` / `ToStringAsFactor`: centralized display formatting.
