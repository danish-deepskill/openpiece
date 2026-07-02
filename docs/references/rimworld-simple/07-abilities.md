# 07 — Abilities: activated powers as comp lists

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`
> Ballpiece mapping: `docs/references/rimworld_patterns.md` §3 → `combat/Ability.ts` + `AbilitySystem`

## The idea in 3 sentences

An **Ability** is the def+instance+comps triple again: `AbilityDef` holds the shared data (cooldown range,
charges, targeting, one `VerbProperties`), the `Ability` instance holds per-pawn state (cooldown timer,
charges), and the behavior is a **list of effect comps** applied in order on cast. New ability = recombine
existing effect comps in XML; new C# only for a genuinely new effect. Casting itself rides the **Job system**
(a cast is a job with the verb attached), and the verb layer makes an ability cast mechanically identical to
firing a weapon.

## Key classes

| Class | Path | Role |
|---|---|---|
| `AbilityDef` | `RimWorld\AbilityDef.cs` | data: abilityClass, comps, verbProperties, cooldownTicksRange, charges, statBases |
| `Ability` | `RimWorld\Ability.cs` | instance: pawn, cooldown state, charges, verbTracker; `Activate` → `ApplyEffects` |
| `AbilityComp` / `CompAbilityEffect` | `RimWorld\` | comp base / the effect contract: `Apply`, `Valid`, `CanApplyOn`, `AICanTargetNow` |
| `CompAbilityEffect_GiveHediff` (+~80 siblings) | `RimWorld\` | the bridge into the hediff engine; also `_Stun`, `_Teleport`, `_Explosion`… |
| `VerbProperties` / `Verb` | `Verse\` | the cast mechanics: range, warmup, targeting, cooldown (chapter 06) |

## Data flow

1. **Grant:** abilities come from data sources — hediffs (`def.abilities`), genes, precepts/rituals, royal
   titles — all funneling into `pawn.abilities.GainAbility`. Nothing grants an ability in code by type.
2. **Cast request:** gizmo/AI → `QueueCastingJob` → a Job with `verbToUse` = the ability's verb → warmup via
   the standard verb stance.
3. **Activate:** `PreActivate` (charges--, `StartCooldown(random in range)`, cooldown propagates across the
   ability's `groupDef`) → `ApplyEffects` loops `CompAbilityEffect.Apply(target)` in order.
4. **Effects land as hediffs** most of the time (`CompAbilityEffect_GiveHediff` sets severity + duration on
   the new hediff's `HediffComp_Disappears`) — the ability system deliberately owns *no* persistent state of
   its own; persistence is the hediff engine's job.
5. **Ability tuning via stats:** `Ability_EffectRadius`, `Ability_Duration`, `Ability_PsyfocusCost` are
   *stats* on the AbilityDef's `statBases` — so ability numbers flow through the chapter-04 pipeline and can
   be modified by gear/traits like any other stat.

## Patterns used

- **Def + instance + comps** — same triple as things/hediffs; comp granularity is the composability dial.
- **Verb unification** — one abstraction for weapon attack and ability cast; targeting, LOS, warmup, and AI
  usage logic are shared for free.
- **Closed-loop layering** — hediffs grant abilities; abilities apply hediffs. Two small engines composing
  through data instead of one big one.

## Gotchas & clever bits

- Cooldowns are a *range* rolled per cast, and `groupDef` lets several abilities share one cooldown pool.
- `AICanTargetNow` on each effect comp is how NPCs know when an ability is worth casting — AI usability is
  part of the effect contract, not a separate AI script per ability.
- Charges + cooldown coexist; `CanCast` gates on both plus comp vetoes.
- Duration comes from a stat (`Ability_Duration`) evaluated at cast time — buffable/debuffable by the normal
  modifier machinery.

## Go deeper

- `RimWorld\Ability.cs` :543 `Activate`, :1175 `Initialize` — the full cast path.
- `RimWorld\CompAbilityEffect_GiveHediff.cs` + its Props — the canonical effect comp, ~40 lines.
- `RimWorld\AbilityDef.cs` — read the field list; it's the whole authoring surface.
- `Verse\Hediff.cs` :304 `AllAbilitiesForReading` — hediff-granted abilities.
- `Verse\VerbProperties.cs` — the shared cast-mechanics vocabulary.
