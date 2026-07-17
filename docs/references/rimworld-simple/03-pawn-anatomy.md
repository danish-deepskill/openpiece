# 03 — Pawn Anatomy: assembling a character from trackers

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`

## The idea in 3 sentences

A `Pawn` is not a monolith — it's a thin **aggregate root** holding ~50 nullable "tracker" fields, each a
focused sub-object owning one slice of state (health, jobs, needs, skills, equipment…). Which trackers exist is
decided at construction from the race's capabilities, so an animal, a mech, and a colonist are the *same C#
class* with different tracker subsets. `Pawn.Tick` is pure fan-out: it calls each non-null tracker's tick in a
fixed order — behavior emerges from composition, not inheritance.

## Key classes (tracker → what it owns)

| Tracker | Path | Owns |
|---|---|---|
| `health` | `Verse\Pawn_HealthTracker.cs` | HediffSet, capacities, bleeding, downed/dead |
| `jobs` | `Verse\Pawn_JobTracker.cs` | current Job + queue + driver (chapter 08) |
| `pather` | `Verse\Pawn_PathFollower.cs` | active path, cell-to-cell movement (spawned only) |
| `mindState` | `RimWorld\Pawn_MindState.cs` | mental state, duty, AI scratch memory |
| `needs` | `RimWorld\Pawn_NeedsTracker.cs` | need bars (chapter 09) |
| `skills` / `story` | `RimWorld\Pawn_SkillTracker.cs`, `Pawn_StoryTracker.cs` | XP/passions; backstory, traits, appearance |
| `equipment` / `apparel` / `inventory` | `Verse\`, `RimWorld\` | weapons / worn / carried (each a `ThingOwner`) |
| `relations` / `genes` / `abilities` / `workSettings` | `RimWorld\` | social ties; xenotype (Biotech); abilities; work priorities |
| Support | `RimWorld\PawnComponentsUtility.cs` | the gating matrix deciding which trackers exist |
| Factory | `Verse\PawnGenerator.cs` | the roll-a-character pipeline |

## Data flow

**Creation** (`PawnGenerator.GeneratePawn(PawnKindDef, Faction)` → `TryGenerateNewPawnInternal` :726):
`ThingMaker.MakeThing(kindDef.race)` → **`CreateInitialComponents`** (trackers gated by race) → age/gender →
humanlike-only block (backstory, name, traits, genes, skills) → faction/kind rolls (training, titles, work
settings) → initial hediffs → **gear from kindDef** (weapon/apparel money ranges + tags) → validators, with
discard-and-retry if a roll fails. On spawn, `AddComponentsForSpawn` adds map-only trackers (pather, filth,
interactions); on death/despawn they're pruned back off.

**Ticking:** `Pawn.Tick()` fans out in fixed order (pather → stances → jobs → health → equipment → abilities →
…); a second batched `TickInterval(delta)` path covers slower trackers (needs, skills, relations, age). Two
clocks, two orders — don't assume one.

## The def split: race vs kind

`ThingDef.race` (a `RaceProperties` block) = the **species**: intelligence tier, body, flesh type, life stages,
think trees. `PawnKindDef` = the **spawn template**: points at a race and layers on how to roll one instance —
backstory filters, trait/skill ranges, gear budgets, `combatPower`. One race (Human) has many kinds (Colonist,
Pirate, Tribal) differing only in generation parameters. Openpiece's `bodies.ts` vs `units.ts` split is the
same two levels.

## Patterns used

- **Aggregate root** — Pawn owns trackers, forwards ticks, exposes derived conveniences (`Downed`, `IsColonist`).
- **Capability-gated null trackers** — not null-objects: trackers stay `null` when inapplicable (animals: no
  `story`/`skills`; only ToolUsers get `equipment`; only Humanlike get genes/story). Everything reads via `?.`.
- **Dynamic trackers** — `AddAndRemoveDynamicComponents` adds/removes trackers as circumstances change
  (`drafter` only for player faction, `trader` only when trading). Membership in the aggregate is itself state.
- **Discard-and-retry generation** — roll whole pawns against validators rather than constraining every step.

## Gotchas & clever bits

- `CreateInitialComponents` is idempotent (every field `== null`-guarded) — reused on load without duplicating.
- The null-tracker design + `ModsConfig.*Active` guards is how one class serves DLC-on and DLC-off installs.
- Animals tick cheaper (`UpdateRateTicks = 15`) — per-kind sim LOD, same idea as ticker classes (chapter 12).
- The trackers are hard-typed **fields**, not comps — mandatory hot subsystems skip the comp bag entirely
  (chapter 02's rule of thumb, applied).

## Go deeper

- `Verse\Pawn.cs` :1538 `Tick`, :1618 `TickInterval` — the authoritative fan-out orders.
- `RimWorld\PawnComponentsUtility.cs` :66–149 — the whole capability-gating matrix; :237 dynamic components.
- `Verse\PawnGenerator.cs` :726 — end-to-end creation; :1166 `GenerateGearFor`; :1438 `GenerateTraits`.
- `Verse\RaceProperties.cs` :261–341 — the intelligence/flesh predicates driving all gating.
- `Verse\PawnKindDef.cs` — note `RaceProps => race.race`, the convenience forward.
