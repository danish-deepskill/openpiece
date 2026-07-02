# 11 — Factions & Relations: one hostility oracle

> rimworld-simple atlas · [summary] · code paths relative to `..\rimworld-decomp\`
> Ballpiece parallel: `defs/factions.ts` relations matrix + `combat/targeting.ts` — same philosophy, already adopted.

## The idea in 3 sentences

Every faction stores mirrored `FactionRelation` records with a numeric goodwill (-100..100) and a derived kind
(Hostile/Neutral/Ally); goodwill changes only through the single write-path `TryAffectGoodwillWith`, and
crossing fixed thresholds flips the kind. The immutable `FactionDef` is the personality (permanent enemy?
humanlike? natural goodwill); the `Faction` instance is live state. Crucially, "is X my enemy?" is answered by
exactly **one** function — `GenHostility.HostileTo` — which every targeting and AI system calls; no team
checks are scattered anywhere else.

## Key classes

| Class | Role |
|---|---|
| `FactionDef` / `Faction` | personality data / live relations, leader, `TryAffectGoodwillWith` |
| `FactionRelation` + `FactionRelationKind` | one directed edge: goodwill + kind + threshold checks |
| `FactionManager` / `FactionGenerator` | registry + cached singletons / worldgen instantiation + initial relations |
| `GenHostility` | **the** hostility oracle |
| `GoodwillSituationManager` | situational caps and natural-goodwill offsets |

## Data flow

Worldgen builds factions from defs and wires initial relations (permanent enemy −100 / natural enemy −80 /
else 0). Gameplay funnels every change through `TryAffectGoodwillWith(other, delta, reason: HistoryEventDef)` —
callers include member damage/kill/capture, trades, gifts, quests, settlement proximity. Each write clamps,
records a HistoryEvent, and may flip the relation kind, which cascades (attack-target caches invalidate,
guests become prisoners). All consumers then ask `HostileTo`.

## The single-source-of-truth ladder

`GenHostility.HostileTo` centralizes every special case *before* the faction-vs-faction fallthrough:
factionless things (neutral, with narrow exceptions) → mental states (`ForceHostileTo`) → hunting predators →
prisoners (non-hostile to their host — until mid-prison-break) → rebelling slaves → dormant things → overseen
mechs. One function to read, one to test, one to extend. This is the strongest single validation of
ballpiece's "factions = data matrix, never team checks" canon — and the special-case ladder is a preview of
the cases ballpiece will eventually need (mental states ≈ berserk pirates; predators ≈ sea kings; prisoners ≈
captured crew).

## Patterns used

Def+instance split · mirrored symmetric edges (written both directions) · **hysteresis thresholds** (Hostile
at ≤ −75 but back to Neutral only at ≥ 0 — no flip-flapping at the boundary) · single write-path with reasons
attached · observer cascade on kind change · homeostasis (goodwill drifts ~25% toward natural over time).

## Gotchas & clever bits

- Effective goodwill = `min(stored, situational cap)` — a cap can suppress a high stored value (ideology
  conflicts cap friendship without erasing history).
- Crossfire immunity: hitting a faction already fighting your target costs no goodwill.
- Permanent enemies and hidden factions simply refuse the write path (`CanChangeGoodwillFor`) — invariants
  enforced at the single entry point, which is the whole payoff of having one.
- The two `HostileTo` overloads duplicate the special-case ladder and must be kept in sync — the one honest
  wart in the design.

## Go deeper

- `RimWorld\GenHostility.cs` — read `HostileTo` top to bottom; it's the chapter in one function.
- `RimWorld\Faction.cs` — `TryAffectGoodwillWith` + the `Notify_*` cascade.
- `RimWorld\FactionRelation.cs` — `CheckKindThresholds`: the hysteresis.
- `RimWorld\GoodwillSituationManager.cs` — the cap/offset engine.
- `Verse\Thing.cs` ~:1756 `SetFaction` — how faction membership changes propagate.
