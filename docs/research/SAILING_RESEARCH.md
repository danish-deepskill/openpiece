# Sailing architecture — external evidence review (2026-07)

> Deep-research pass over shipped games, open repos, and physics references, asking ONE question: is the
> five-piece sailing model (SAILING.md) SHAPED right for the future load — storms, wind fields, player-built
> ships, crew caps, AI fleets, sim-LOD ledgers, momentum impacts? Method: fan-out search → source fetch →
> claim extraction → adversarial verification (3 refute-votes per claim). The verification stage was cut
> short by a session usage limit, so confidence is labeled per claim: **[VERIFIED]** = survived 3-0
> adversarial votes · **[SOURCED]** = extracted from a primary source but votes incomplete · **[LORE]** =
> explicitly hedged secondhand. Synthesis by Session A against the labeled claims.

## The verdict table (what to do about our five pieces)

| Piece | Verdict | Why (evidence) |
|---|---|---|
| Wind as ONE stateful stepped vector | **RESTRUCTURE NOW** → closed-form field | see §1 |
| sailCurve angle-bucket tables | **FINE-AS-BUILT** (the genre-standard sufficient abstraction) | see §2 |
| Momentum-as-easing + driftEase | **FINE-AS-BUILT** | see §2 |
| Rudder authority from waterflow | **FINE-AS-BUILT** (independently converged) | see §2 |
| Discrete sail/anchor states (planned) | **FINE — and network-load-bearing** | see §5 |
| True-wind-only curve evaluation | **ADAPT when sail states land**: apparent wind | see §3 |
| Part-derived curves (backlog #11) | **DEFER, shape recorded** | see §4 |
| Ledger/dehydrated sailing (#14) | **DEFER, blueprint recorded** | see §5 |

## §1 · Wind: global stateful → evaluated field (the one restructure)

- **[SOURCED]** Curl-of-noise-potential fields are closed-form in (position, time): evaluable anywhere,
  repeatably, no history/grids/PDE solves — exactly the determinism + cheap-sampling + forecastability
  property a seeded sim needs (Bridson et al., curl-noise; real-time in 2007).
- **[SOURCED]** Raw noise used directly as a velocity field is DEFECTIVE — plain noise isn't
  divergence-free, so it develops sinks/dead-zones. Curl construction is artifact-free by identity.
- **[SOURCED]** Event modulation (a storm spiking local strength) must multiply the POTENTIAL, not the
  output velocity, to stay divergence-free: `v = ∇×(A(x)·ψ(x))` — the concrete pattern for layering
  event-director weather onto a base field.
- **[SOURCED]** The stepped alternative (grid of coupled ODEs) ships in at least one indie weather sim but
  with recorded costs: boundary-condition artifacts at domain edges (poison for a CHUNKED sea), and only
  affordable at coarse cadence (~in-game-hourly). A simpler shipped middle exists: global time-noise vector
  + deterministic per-cell terrain modulation.
- **[SOURCED]** DIS-standard dead reckoning advances entities by small CLOSED-FORM extrapolation over a
  compact kinematic state, with threshold-based corrections and convergence smoothing — the ledger tier's
  blueprint. A stateful wind breaks it: the ledger can't share stepped wind without replaying it.
- **[SOURCED]** X4's two-tier sim is the cautionary tale: its low-attention tier makes NO attempt at
  outcome-equivalence (30%-chance turret proxies, no collision/LOS, inverted mining efficiency) and players
  visibly notice tier-dependent battle outcomes. **[LORE]** on exact mechanisms (forum-hedged, no dev
  source) — but the failure MODE is well-attested. Closed-form-shared-by-both-tiers is how we avoid it.
- Calibration nugget **[SOURCED]**: gusts fluctuate ~±7% on a 6–12s cycle (Bethwaite, *High Performance
  Sailing*, cited in a sail-trim sim repo) — a source-backed number for the field's gust octave.

**The shape:** `windAt(x, y, simTime) → {vx, vy, strength}` — a pure seeded function; layered octaves
(global drift + regional character + gusts); event-director modifiers as potential-multipliers with
region + schedule. WindSystem stays as the thin stepped wrapper that advances `simTime` and caches the
per-tick sample at hot positions; ships already consume a sampled vector, so the consumer API barely moves.
This also aligns sailing with SEAMLESS_WORLD's thesis ("a dehydrated thing is EVALUATED, not slow-ticked").

## §2 · The curve/table model: confirmed from every direction

- **[VERIFIED 3-0]** Sailwind — the genre's realism flagship — is built on a real physics model… and its
  developer reports a steep learning curve and a RELATIVELY HIGH REFUND RATE attributed to it. Realism
  measurably broke feel in a shipped commercial game. (gamedeveloper.com interview.)
- **[SOURCED]** Sailwind's mitigation was UX (visualizing the no-go zone), NOT simplifying the model — and
  genre-wide speed inflation is standard practice (boats deliberately faster than life).
- **[SOURCED]** A physics-minded RL sailing sim models drive as a POLAR DIAGRAM + momentum + separate hull
  drags — table-driven at the core. A dedicated sail-trim simulator is geometry/table-based with the force
  model an unimplemented TODO, and its author names the polar diagram as the one missing piece for
  realistic speed — the polar/curve IS the standard sufficient abstraction.
- **[SOURCED]** A force-based Unity sailing project ended up table-driven anyway (lift/drag via coefficient
  LOOKUP TABLES), never closed its hull-drag model (fudge constants + TODOs), and its own scope list counts
  ~10 simultaneous force contributions for honesty — the complexity floor of "real" force models.
- **[SOURCED]** Naval Action (the hardcore end) models per-sail forces but WRAPS them in an auto-skipper so
  the default control surface stays simple; Game-Labs' stated fidelity target is the player's "realistic
  MENTAL model", not physical accuracy. They also found no off-the-shelf physics adequate and wrote custom
  sim + server (validates engine-agnostic custom sim).
- **[VERIFIED 3-0]** Physics ground truth for curve SHAPES: fastest point of sail is ~abeam, not downwind;
  dead-downwind can never reach wind speed (apparent wind dies). Our FORE_AND_AFT (peak 90°) and
  SQUARE_RIG (taper at 180°) match; keep this rule when authoring future rigs.
- **[SOURCED]** Rudder-from-waterflow independently converged (the RL sim: authority ∝ speed through
  water, zero at rest, capped). **[VERIFIED 3-0]** AI driving the same dynamical system as the player, no
  cheat physics, is workable (SailingSim, 2009) — the Moat holds at sea; its NPCs even do utility-scored
  candidate rollouts, our exact AI-fleet plan.

## §3 · Apparent wind — the ONE physics piece the evidence says to add

- **[SOURCED, convergent ×4]** Apparent wind (true wind minus boat velocity) is modeled even in simplified
  sims and repeatedly judged the piece of real physics that EARNS its keep: sail forces physically act on
  apparent wind, and the effect matters precisely for craft moving at a large fraction of wind speed —
  which our inflated game speeds guarantee. Also **[VERIFIED 3-0]** via the downwind physics above.
- What it buys as FEEL: running downwind fast self-limits (you can't outrun your own wind — emergent, no
  cap code); beating upwind reads livelier (apparent wind strengthens). One vector subtraction per ship per
  tick. **When:** with the sail-states drop, where strength enters the formula anyway. Height gradients,
  heel, leeway: over-modeling for our tier — leeway only if playtest ever wants more sideways feel than
  driftEase gives (**[SOURCED]** its real mechanism, for that day).

## §4 · Part-derived performance (backlog #11) — the pipeline pattern, recorded for later

- **[SOURCED]** Cosmoteer is the flagship precedent: per-part stats as data (thrust per thruster size),
  derived handling = aggregate/mass ratio (doubling both changes nothing), closed-form drag makes any
  build's steady state ANALYTICALLY computable (exactly what ledger math needs), adjacency effects exist in
  the derivation (engine room boosts neighbors — mast placement analogue), and the AI flies the derived
  model. Community calculators reproduce it — deterministic and data-complete.
- **[SOURCED]** Factorio: content composed in a staged data phase (base → updates → final-fixes), FROZEN
  before the sim starts, definition-phase code discarded — the shape for "compute the derived sailCurve at
  dock-build time, freeze it on the ship instance, sim reads it immutably."
- **[SOURCED]** RimWorld StatWorker: fixed offsets-before-factors order, two-phase with pluggable parts,
  post-process curve + clamp — transcribed from decompiled code. Our StatBlock/Modifier stack is already
  this shape; the derived-curve pipeline should reuse it, not invent a second stacking order.
- **Cheap NOW:** route curve reads through the ship ENTITY (`sailCurveOf(ship)` → today the hull def's
  table; later the frozen derived instance curve). One seam, one call site change.
- Also **[VERIFIED 3-0]**: hull speed = 1.34·√(waterline ft) — a principled √length scaling for deriving
  maxSpeed from built hull size when #11 lands.

## §5 · Determinism, networking, LOD — the constraints that VALIDATED existing choices

- **[SOURCED]** Deterministic lockstep favors SAMPLED PER-TICK COMMAND STATE over event-driven continuous
  controls — discrete sail/anchor states are network-load-bearing design, not just feel. (Plus bandwidth ∝
  inputs, not objects: the payoff that justifies keeping fleets deterministic.)
- **[SOURCED]** FP determinism: same-machine/same-binary is achievable (our replay + headless server tier);
  cross-compiler/architecture is NOT free — transcendentals (sin/cos) differ across CPUs (shipped-game
  case: Battlezone 2). Note for the far future: cross-machine lockstep would need a trig audit of the wind
  field + curves. Not actionable now; recorded so it isn't a surprise.
- **[SOURCED]** Sea of Thieves ran ships as big nested rigid-body objects and physics cost CAPPED SHIP
  COUNT (Rare AMA, 2017) — they cut object fidelity to afford ships. Validates our no-engine-physics sim.
  Their proximity streaming used sail travel time as the load window (blocked a spyglass feature over it) —
  the same travel-time-hides-streaming bet SEAMLESS_WORLD makes.
- **[SOURCED]** Naval Action's waves are server-authoritative shared state BECAUSE they're gameplay
  (hull exposure) — weather that affects combat must be sim truth, never cosmetic. Our field is sim-side ✓.

## Highest-value deep reads
1. *The Physics of Sailing* (Physics Today) — curve shapes, hull speed, apparent wind. [2× VERIFIED]
2. Bridson's curl-noise construction — the wind field implementation.
3. RimWorld StatWorker wiki page (decomp-transcribed) — the derived-stat ordering.
4. DIS dead-reckoning literature — the ledger tier blueprint.
5. Sailwind gamedeveloper.com interview — the realism/feel trade, with refund receipts. [VERIFIED]

## Confidence caveats
Verification was cut at the session limit: only 6 claims carry full 3-0 adversarial votes; everything
[SOURCED] traces to a fetched primary source but skipped some refute votes; X4 mechanism details are
[LORE]. Nothing in the restructure list rests on [LORE] alone.
