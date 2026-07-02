# 06 — Combat Resolution: from attack decision to damage applied

> rimworld-simple atlas · [deep] · code paths relative to `..\rimworld-decomp\`

## The idea in 3 sentences

Every attack — fist, longsword, bolt-action rifle, artillery shell — is a **Verb**: a small state machine that
warms up, fires a burst, and rolls to hit. A hit produces a `DamageInfo` value-struct handed to
`Thing.TakeDamage`, which dispatches to the `DamageDef`'s pluggable `DamageWorker`. For pawns the worker picks
a body part, subtracts armor, and materializes the damage as an injury **hediff on that part** — combat output
and the health system are literally the same data, and death is capacity failure, not hp==0.

## Key classes

| Class | Path | Role |
|---|---|---|
| `Verb` | `Verse\Verb.cs` | abstract cast engine: warmup stance, burst loop, LOS/range |
| `Verb_MeleeAttack(-Damage)` | `RimWorld\` | melee rolls (non-miss → dodge) + DamageInfo build |
| `Verb_LaunchProjectile` + `Projectile`/`Bullet` | `Verse\`, `RimWorld\` | ranged: accuracy verdict → spawned projectile → impact |
| `ShotReport` | `Verse\ShotReport.cs` | the ranged hit-chance pipeline as a struct |
| `DamageInfo` | `Verse\DamageInfo.cs` | parameter object: def, amount, penetration, angle, instigator, weapon |
| `DamageDef` + `DamageWorker(_AddInjury)` | `Verse\` | def+worker strategy; AddInjury = the pawn path |
| `ArmorUtility` / `CoverUtility` | `Verse\` | layered deflect/diminish math / per-cell block chance |
| `Pawn_MeleeVerbs` | `RimWorld\` | weighted random selection of which melee verb swings |

## Data flow — two walks converging

**Melee:** gather all melee verbs from body + equipment + apparel + hediffs → weighted pick (weight ≈ DPS
bucketed Best/Mid/Worst — deliberately not always-optimal) → warmup stance → `TryCastShot` rolls
`MeleeHitChance` (caster stat) then `MeleeDodgeChance` (target stat) → build `DamageInfo` (damage randomized
0.8–1.2×, tool tags, weapon-linked hediff riders enter here) → `TakeDamage`.

**Ranged:** `ShotReport` multiplies accuracy factors — shooter accuracy raised to a *distance power* × weapon
accuracy by range band × weather × darkness — then a failed aim roll goes wild, a failed `PassCoverChance`
roll diverts *into* the cover thing. Otherwise spawn a `Projectile` that flies per-tick, gives things in the
flight path a free-interception chance, and on impact builds a `DamageInfo` → `TakeDamage`.

**Convergence:** `DamageWorker_AddInjury.ApplyToPawn`: choose hit part (weighted by part coverage) →
`ArmorUtility.GetPostArmorDamage` walks apparel layers then natural armor (deflect / diminish / **damage-type
downgrade**: deflected Sharp becomes Blunt) → `FinalizeAndAddInjury` creates a `Hediff_Injury` with
`Severity = damage` → `pawn.health.AddHediff`. Death is decided afterward by `ShouldBeDead()`: lethal hediff,
required capacity (consciousness, blood pumping) at zero, or core part destroyed.

## Patterns used

- **One verb abstraction** for melee/ranged/abilities — "swing fist", "fire rifle", "cast psycast" differ only
  in `verbClass` + data. The unification point for ballpiece's four combat layers.
- **Def + worker strategy** (`DamageDef.workerClass`) and **parameter object** (`DamageInfo` threading ~20
  fields through a deep call chain).
- **Template method** — `Verb.TryCastNextBurstShot` orchestrates; subclasses fill `TryCastShot`.

## Gotchas & clever bits

- **No parry** in this build — melee is only non-miss → dodge, despite common assumption.
- **Cover is a flat block roll**, not a to-hit modifier — and the blocked bullet *hits the cover*, so
  sandbags get shot to pieces. Cheap and emergent.
- **Friendly fire is a distance-shaped chance** (zero within ~5 tiles of the muzzle, full at 12), scaled by
  difficulty.
- Colonist instant-kill protection: injury finalize retries up to 7× with shrinking severity.
- Big hits **fragment** across 2–4 parts above a threshold — spreading injuries instead of one deep wound.
- Battle log narration is grammar-generated (chapter 18 §4) and linked to the actual hediffs it describes.

## Go deeper

- `RimWorld\Verb_MeleeAttack.cs` `TryCastShot` — the complete melee roll sequence.
- `Verse\ShotReport.cs` `HitReportFor` + `RimWorld\Pawn_MeleeVerbs.cs` `TryGetMeleeVerb` — both selection maths.
- `Verse\DamageWorker_AddInjury.cs` (`ChooseHitPart`, `FinalizeAndAddInjury`) + `Verse\ArmorUtility.cs`.
- `Verse\Pawn_HealthTracker.cs` `ShouldBeDead` / `PawnCapacityUtility` — injuries → capacities → death.
- `Verse\Projectile.cs` `CheckForFreeIntercept` — flight-path interception.
- `Verse\Explosion.cs` + `DamageWorker.ExplosionAffectCell` — AoE reusing the same DamageInfo pipeline.
