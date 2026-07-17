# Openpiece — The Gym (offline AI tuning pipeline)

> **Stage:** designed — offline tuning harness design; build gated on the intent pipeline

> Design capture, ahead of the code — the OFFLINE tooling that produces the tuned weight tables
> `AI_FOUNDATION.md` §6 consumes. Companions: `AI_FOUNDATION.md` (the decision engine these weights drive;
> its phase 4 = this doc's build trigger), `AI_INTELLIGENCE.md` §8 (the policy: ML offline-only, runtime
> learning BANNED — non-negotiable). Judged source: a browsed evolutionary-training proposal (2026-07) —
> adopted: headless reuse, the loop, the exporter, the ladder gate; REJECTED: evolution-curve snapshots as
> INT tiers (an unconverged genius is not a believable idiot — see §2). The gym is BUILD-TIME TOOLING and
> never ships; players only ever meet its graduates.

## 1. Thesis — maximize the ceiling, calibrate the ladder

The gym exists to answer one question at scale: *given this tier's authored handicaps, what is the right
play?* Its prime rule follows from the INT design (capability-defined tiers, `AI_INTELLIGENCE` §3):

- **INT 10 is MAXIMIZED** — full menu, full sensors, tight dials; the optimizer searches for the strongest
  play the engine allows. The ceiling must be real.
- **INT 1–9 are CALIBRATED, not maximized** — each tier is tuned toward an AUTHORED TARGET PROFILE (win-rate
  band vs its neighbors, TTK band, behavior metrics). Fitness for a mid tier = closeness to its profile,
  never raw win rate. Maximizing every tier collapses the ladder into one optimal play wearing ten
  handicaps; calibration is what makes "INT 6 feels smarter than INT 5" a measured property, not a hope.

And the "rules engine" question answered the house way: the gym needs no external rules framework — **the
gym's rules ARE def rows**. Scenarios, target profiles, and invariants are registries with boot validators,
exactly like abilities and units (content-is-data applied to the tooling itself). Predicate-bearing invariant
rows live beside the gym engine, the same convention as `MOTIONS`/`draws`.

## 2. What is authored vs what is tuned (the anti-snapshot decision)

| AUTHORED (design owns it — the ladder's SHAPE) | TUNED (the gym owns it — the POLISH) |
|---|---|
| `TierDef` per INT 1–10: menu min-INT gates, sensor tier (what's perceivable + memory), execution dials (reaction, telegraph, cancel window, aim lead), pick temperature | The weight vector per (archetype × tier): consideration weights the scorer multiplies — typically ~20–50 floats |
| Personality clamps per archetype (hard bounds on weights — the berserker's retreat ceiling) | Nothing outside the clamps — tuning happens WITHIN character |
| Target profiles per tier (§3) | — |

Rejected alternative (the browsed proposal): snapshotting one evolution run's curve as the ten tiers.
Three failures: an early-generation snapshot has FULL capabilities badly weighted — erratic, not dumb
(our low INT = short menu + poor senses, dumb *with coherence*); evolution is non-monotonic in style, so
curve snapshots guarantee inversion bugs ("6 feels dumber than 5") structurally; and it forfeits design
authorship of what each tier lacks. **Salvaged from it:** curriculum seeding — initialize tier N's search
from tier N+1's converged weights, perturbed (a warm start, none of the downsides). Tuning order is
therefore top-down: 10 first, then 9 seeded from 10, … down to 1 (which barely needs tuning — a two-entry
menu has little to weigh).

## 3. Target profiles — the calibration contract (data rows)

Each (archetype × tier) row states what "correct" looks like as NUMBERS — the eye-test, encoded:

```
target.musketeer.int5 = {
  ladder:   { vsInt4SameKit: [0.65, 0.80], vsInt5SameKit: [0.45, 0.55] },  // the monotone ladder, banded
  pacing:   { ttk: [8, 40], idleMaxSec: 3 },
  behavior: { comfortBandPct: ≥0.60, escapeUnspentInWinsPct: ≥0.70, retreatWhenLowHpPct: ≥0.8 },
  // archetype rows add personality checks: berserker retreatsPct ≤ 0.05, coward engagesFirstPct ≤ 0.2 …
}
```

Bands, not points (a ladder where the lower tier NEVER wins reads as scripted — and INT-10-beatable is canon,
`AI_INTELLIGENCE` §9.1). These rows are also the regression suite (§7): they re-run in CI when content
changes, so "your weapon nerf broke the INT 6 musketeer" is a red row, not a player complaint.

## 4. The loop

```
for each (archetype × tier), top-down (10 → 1, curriculum-seeded):
  population ← current shipped weights + perturbations (or tier N+1's champion, perturbed)
  repeat until targets met / budget:
    for each candidate:  run the SCENARIO MATRIX (§5) headless — hundreds of seeded fights
    FILTER:  candidates violating invariants or personality clamps score ZERO   ← the anti-reward-hack rule
    SCORE:   INT 10 → maximize win metrics · INT 1–9 → minimize distance to the target profile
    SELECT + mutate/recombine (GA) — or plain hill-climb; the optimizer choice is the LEAST important
             part of this doc; the filter + targets carry the design
  LADDER GATE (§6) → export champion as def rows (§7)
```

The filter rule is load-bearing: optimizers are ruthless cheese-finders (the immortal coward who kites to
timeout has superb survival). Invariants are hard filters; fitness only ranks the survivors that *still play
like the character*.

## 5. Scenarios + the league (what candidates fight, where)

- **`GymScenarioDef` rows:** arena (open / walled / chokepoint / shore / deep-water edge), team shape (1v1 /
  2v2 / outnumbered 1v3), handicaps (HP/stamina offsets, spawn distances), seed batches. Coverage is a
  validator: every tier must train across ≥N distinct arenas and team shapes — a kiter tuned only on open
  ground is a lie near walls.
- **HOLDOUT scenarios** — a reserved set never used in tuning, only in validation. If a champion's metrics
  hold on scenarios it never trained against, the weights generalized; if not, the training set was
  overfit. (ML hygiene, applied with sim seeds.)
- **The opponent LEAGUE** — candidates never train purely against themselves (self-play collapses into
  rock-paper-scissors cycling): the pool is scripted reference bots (a pure rusher, a pure turtle, a
  scripted kiter — cheap, stable yardsticks) + FROZEN champions of other archetypes/tiers + the currently
  shipped weights. League membership is data; frozen means deterministic.

## 6. The ladder gate (ship blocker)

Before any weight table exports: **tier N beats tier N−1, SAME KIT, in the banded ratio (~65–80%) across the
scenario matrix including holdouts.** Two deliberate scope limits: same-kit only — cross-kit dominance is NOT
enforced, because kit counterplay legitimately beating higher INT is the moat's counterplay pillar working,
not a bad run (tracked as a report, never a gate); and banded, not absolute — see §3. A failed gate ships
nothing and flags seeds (§7).

## 7. Runs, artifacts, and the human's seat

- **Throughput:** fights are headless ticks (a 30s fight ≈ 1,800 `SIM_DT` steps — single-digit milliseconds
  headless). Parallelism is trivial because fights share nothing: `worker_threads`, one World per fight,
  seeds partitioned per worker — order-independent, mergeable, reproducible. Order of magnitude: tens of
  thousands of fights per hour on one dev machine; an overnight run covers a full archetype × tier sweep.
  (This is the "many live simulations" — batch and headless. A rendered LIVE spectator of gym fights is a
  🧊 nice-to-have; the replay path below covers the real need.)
- **Artifacts per run:** the champion weight rows (a def family, `weights.<archetype>.int<N>`, parent
  inheritance for shared bases) + a run report (metrics vs targets, per scenario) + **flagged seeds** —
  every fight that violated an invariant or sat at a metric extreme.
- **The human's seat (determinism's dividend):** a flagged seed replays TICK-PERFECT in the real game — the
  gym hands you the exact five weird fights out of ten thousand, you watch them rendered, and you adjust
  either the weights' clamps or the RULE that flagged them (sometimes the invariant is what's wrong). Your
  supervision is: author the targets, hand-tune feel FIRST (the scorer must feel right before the first gym
  run — `AI_FOUNDATION` §6 guardrail), review the flags, and do one ~20-min representative feel pass per new
  archetype. Never the matrix.
- **Perceivability check stays manual:** "feels less intelligent than the tier below" is often a LEGIBILITY
  failure, not a weights failure (smarter is frequently less flashy) — check the tier's visible signature
  (`AI_FOUNDATION` §7.3) before touching numbers.

## 8. Prerequisites + build trigger

- **`HeadlessSim` extraction** — the one missing module: the canonical ordered system composition currently
  lives in `WorldScene.stepSim` (presentation); extract `createSim()` that WorldScene, the tests, AND the gym
  all consume. Independently worthwhile now: today's tests hand-compose system subsets, a proven drift source
  (the deferred-shot-spawn test gap). This extraction may land before the gym itself.
- Everything else waits for **AI_FOUNDATION phase 4's trigger**: the scorer exists (phase 2), feels right
  hand-tuned, and ≥3 archetypes × ≥3 tiers are live — calibration needs a ladder to calibrate.

## 9. Refusals (standing)

No runtime learning, ever (`AI_INTELLIGENCE` §8). No maximizing mid tiers (calibrate). No self-play-only
training (the league). No shipping weights that skipped the ladder gate or holdouts. No tuning a scorer that
hasn't been hand-felt. No external rules engine — scenarios/targets/invariants are def rows in OUR registries,
validated at load like all content.
