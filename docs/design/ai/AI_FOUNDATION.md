# Openpiece — AI Foundation (the decision engine)

> **Stage:** designed — intent pipeline + executor recursion; code is still FSM

> Design capture, ahead of the code — the ARCHITECTURE that executes `AI_INTELLIGENCE.md` (the INT axis: what
> intelligence *is* here; its §10 names this doc's pipeline as the build-first prerequisite). Companions:
> `../../references/ai-decision-action.md` (the browsed intent taxonomy this doc judges + adopts),
> `../../references/rimworld-simple/08-ai-thinktrees-jobs.md` (ThinkTree → Job → JobDriver — the closest shipped
> prior art, decompiled source on disk), `../DEEP_SIMULATION.md` (scale/LOD), `../DESIGN_BACKLOG.md` #12 #16 #19.
> Code seeds today: `ai/brains.ts` (the kite beat loop = the architecture in embryo), `defs/aiProfiles.ts`
> (knobs-as-data), `combat/Ability.ts` (AI role tags), `systems/SquadSystem.ts` (tokens/focus — the primitive
> command layer). Designed 2026-07; built on TRIGGER, not on enthusiasm (§10).
>
> Every section closes with its **hard question** — the sharpest way that section could be WRONG, and the
> test or rule that answers it. A design that can't name its own falsifiers isn't done.

## 1. Thesis

**One decision engine, run recursively at every scale.** Units, squad leaders, fleet admirals, and (later)
territory rulers all run the SAME funnel — *gather candidates → gate → score → pick → commit an intent →
execute* — differing only in their menus (moves vs orders), their tick cadence, and their INT-gated quality.
Enemies are never authored as brains; they are authored as DATA fed into the one engine: a kit (what moves
exist — ability role tags), a personality (what it wants — profile clamps), and INT (how well it perceives,
decides, and executes). The combinatorial explosion (styles × fruits × INT × personalities) is defeated by
making every axis orthogonal data over shared machinery — engines over content volume, applied to minds.

**Verdict on the reference taxonomy** (`ai-decision-action.md`, browsed 2026-07): the 30 unit intents + 7
command orders are adopted as the *vocabulary*, not the v1 scope; its decide→intent→execute pipeline and
orders-as-bias command layer are adopted outright; its consideration-gating, pick-jitter, and visual-variant
ideas are adopted with corrections (§2). What it under-specifies — and what our own kiter work proved is
load-bearing — is the COMMITMENT layer (§7.1): without it, any per-tick scorer degenerates into the
pixel-mirroring bot we already killed once.

**Hard question — *which domain breaks the one-engine claim first, and what's the test?*** Combat scores
cleanly (distance, HP, cooldowns are numbers). Social does not: "betray vs stay loyal" needs long-horizon
value estimates a one-step scorer fakes badly; commerce needs price expectations over time. The falsifier:
if the social pass (§12.7b) cannot express MUTINY as considerations-over-state without a bolted-on special
case, the thesis downgrades from "one engine" to "one engine for embodied domains" — an acceptable retreat,
but it must be declared then, not papered over.

## 2. The pipeline (one decision beat)

Decisions fire at MOMENTS (intent resolved / aborted / a real interrupt), cadence-staggered per unit —
never a per-tick re-pick. Per beat:

```
unit.int = N (one dial on the unit row)
    ↓
GATHER candidates      universal verbs + kit tags (weapon/fruit/style adds moves; role tags classify them)
    ↓  MENU GATE       min-INT per action (data): low INT never even considers feint/take_cover
    ↓
BUILD context          SENSORS by INT tier — what is visible AND what is REMEMBERED (AI_INTELLIGENCE §2, §4:
    ↓                  INT 2 = distance + own HP, 2s memory · INT 8 = your stamina, counted cooldowns,
    ↓                  habit counters, cover lines, squad state)
SCORE each candidate   considerations × weights. Weights = data rows per (archetype × INT), GYM-tuned
    ↓                  offline (§6) within personality CLAMPS. CONSIDERATION GATE: low INT runs FEW
    ↓                  consideration curves, noisily — dumbness at two granularities (what's scored at all,
    ↓                  and how carefully). + order BIASES injected by the commander (§5).
PICK                   softmax on the seeded `ai` stream — TEMPERATURE by INT: INT 10 ≈ argmax (consistent
    ↓                  reads as intentional); INT 2 samples hot (can pick a worse option — stupidity as
    ↓                  inconsistency, biased weights as wrong PREFERENCES; both, deterministic).
INTENT COMMITTED       { kind, target, dest, until, abortOn } — the anti-twitch contract (§7.1). The SAME
    ↓                  component player input writes (§3).
EXECUTE (per SIM_DT)   the intent's executor (§4) + a visual VARIANT from the action's pool (cosmetic ⇒ free
    ↓                  roll; hitbox/phase-affecting ⇒ seeded stream). EXECUTION DIALS scaled by INT —
    ↓                  telegraph length, aim lead/precision, cancel window, follow-up chance — shared generic
    ↓                  dials, never per-style curves (reaction/leadAim/aim-settle on AIProfileDef are these,
    ↓                  already shipped).
ANIMATION / HITBOX     one combat engine (Melee/Projectile/MovementSystem) — identical for player and AI.
```

**Hard question — *where do multi-step PLANS come from?*** A scorer picks the best NEXT action; tactics are
CHAINS (feint → punish the bite; ignite the chokepoint → herd into it). F.E.A.R. needed a planner for
exactly this. Current bet: chains emerge from considerations that read committed state ("I just feinted" is
context for the next beat) plus executor follow-ups. The falsifier: if the INT-8 scenario (§8) cannot be
built without an intent that issues SUB-intents in authored sequence, that is GOAP arriving through the back
door — admit it as a fourth pipeline stage then, don't smuggle it into an executor.

## 3. One intent pipe — the Moat completed

The Intent component has THREE writers and one consumer set: **player input** (InputSystem — this IS the
roadmap's PlayerIntent/multiplayer keystone), **the AI scorer**, and later **the network**. Execution never
knows or cares who wrote the intent. Consequences, all load-bearing: possession = swapping the writer (not
special-casing control); AI and player literally share the execution stage (the Moat, structurally enforced);
intents serialize ⇒ replays, server-authoritative netcode, and headless tests come free; and the AI pass and
the netcode keystone are ONE design — building them as two vocabularies would be deliberate drift.
**Refusal:** no AI-only execution paths, ever. If the AI can do it, an intent expresses it, and a player
(possessing, or via orders) can too.

**Hard question — *does 60 Hz twitch input honestly compress into intents?*** Move and aim are CONTINUOUS
channels, not decisions; they will likely ride BESIDE the intent component as raw axes — which makes "one
pipe" true only for discrete actions, and the interesting cases (charged holds, aim-while-committed, cancel
timing) live exactly on that boundary. The PlayerIntent spec (§12.1) must draw the discrete/continuous line
explicitly; if it ends up with player-only channels the AI never writes, the Moat has a seam — measure and
name its width rather than claiming it isn't there.

## 4. The recursion principle — executors are decision funnels too

INT 7 retreat and INT 2 retreat must be unrecognizable as the same action — WITHOUT ten retreat executors.
The funnel recurses one level down: each executor has internal CHOICE POINTS fed by the same gate → consider
→ score → commit machinery, over micro-decisions instead of intents.

Retreat's choice points, as the worked example:

| Choice point | How INT changes it |
|---|---|
| **Destination** — scored over CANDIDATES | Candidate *generation* is sensor/INT-gated: INT 2 generates one ("directly away" — into your corner); INT 5 adds wall/water-avoiding vectors; INT 7 adds allies, cover points, chokepoints, the exit. Same scorer picks among them. |
| **Maneuver** — a min-INT-gated pool (data, the menu gate one level down) | `straight_run` 1+ (back turned, panicked) · `backpedal_facing` 3+ (guard up) · `weave` 4+ · `roll_through_gap` 5+ (the shipped juke-roll) · `break_line_of_sight` 6+ · `fighting_withdrawal` 7+ (fires during retreat beats) |
| **Commitment** | Same contract as intents: destination + maneuver held until reached/aborted. A smart retreat is still not twitchy. |

The anti-explosion accounting: **maneuvers are authored once, ever** (a linear library feeding a
multiplicative space); **candidate generators are shared utilities** (the cover-point finder serves
take_cover, retreat, AND reposition — paid once); **personality composes here for free** (a coward's weights
favor break_LoS, a proud duelist's favor backpedal_facing — two INT-7s retreat differently, one weight row
apart). The shipped kiter already proves the pattern unnamed: `planKiteReposition`'s three destination cases
+ the walk-vs-juke-roll choice ARE a destination scorer and a two-entry maneuver pool.

**Hard question — *can anyone DEBUG a nested scorer?*** Utility AI's classic curse is "why did it do that?";
recursion doubles it (a scorer inside an executor inside a scorer). The commitment: the debug overlay must
render, for any unit's last decision beat, the scored candidates AND the winning margins at BOTH levels — or
tuning becomes archaeology and gym failures become unexplainable. If a unit's last decision can't be shown
as one legible panel, the recursion is too deep. The depth cap is enforced by OBSERVABILITY, not by rule.

## 5. Command scopes — the recursive composite, ECS-native

The hierarchy is a Composite, but NOT a class hierarchy: **a scope is an entity** with a `command` component
(`parentId`, doctrine, standing orders), membership by id — exactly how `squad` works today, serializable,
and the same structure backlog #12's territory layer needs, built once.

**Scopes and brains run in DOMAINS — and a domain is data, not an engine.** A domain = a menu family + a
sensor set + a cadence band over the ONE pipeline (§2). The corpus implies nine: **combat** (the transient
chain below) · **operations/campaign** (the persistent brains below) · **livelihood** (jobs, needs,
schedules — crew duties, civilians; backlog #1/#2/#18; the RimWorld JobGiver domain) · **social** (the
interaction web — recruit/threaten/befriend/betray, morale, MUTINY; backlog #17; the recruit verb is the
shipped embryo) · **commerce** (traders' route/stock/price/flee decisions — these ARE the living economy,
backlog #7) · **seafaring** (the helm brain: course vs wind, weather routing, naval maneuver; the ship as a
crewed composite scope — SAILING/NAVAL) · **instinct** (fauna: hunger/territory/flight; the critter flee +
territorial bull are the shipped embryo) · **agenda** (an individual's long-horizon arc — bounty climbing,
promotion hunting, fruit seeking; where Nemesis rivals live; "the player is not the only one climbing") ·
**the Director** (non-diegetic — backlog #8's storyteller scores EVENTS with the same consideration
machinery; named here so nobody builds it a second engine).

**The domain ARBITER:** with multiple domains, something decides which one a body is in right now — the
fisherman is livelihood until pirates land (combat), then a witness (social, feeding the knowledge economy).
Arbiter = interrupt/priority rules between domains (combat preempts livelihood; agenda schedules it; social
embeds in it). Today's wander/alert/chase FSM IS the embryonic two-domain arbiter (routine ↔ combat);
generalizing it is a queued design pass (§12). The two scope KINDS below are the combat + operations domains
made concrete — the pattern for the rest:

**The COMBAT command chain (transient — exists for an engagement, then dissolves):**
| Scope | Size / occasion | Cadence | Menu flavor |
|---|---|---|---|
| unit | one body | ~1–2 decisions/s, staggered | moves (§2) |
| squad | 2–5 units | ~2s | focus fire, flank route, hold formation |
| division | several squads — a WAR commander's brain | ~10s | commit/refuse squads, feigned retreats, sacrifice delays |
| fleet | divisions + ships — general-level (Yonko clash, a Buster Call) | ~30–60s | naval formations, landing waves, withdrawal lines |

**The OPERATIONAL / CAMPAIGN brains (persistent — a base always has its commander, a territory its ruler):**
| Scope | Example | Cadence | Menu flavor |
|---|---|---|---|
| base | a marine commodore's garrison | ~minutes | patrols, alert levels, investigations, requisitions, bounty posting |
| territory / campaign | a Yonko's domain | minutes–hours | raid targets, alliances, tribute/economics, promotions, wars |

Rules (all scopes, both kinds):

- **A commander is a unit whose menu is orders.** Same scorer; the executor writes SCORE BIASES into
  subordinates' pipelines (stage: SCORE, §2) instead of moving a body. One brain family, different menus at
  different cadences. Leader INT = scope quality (AI_INTELLIGENCE §6), now structural.
- **Persistent brains SPAWN transient ones.** The commodore's `dispatch_patrol` intent CREATES a squad scope
  with standing orders; a Yonko's `raid` intent creates a fleet. Combat command chains are the *executors'
  output* of operational brains — the two kinds compose, they don't compete.
- **Operational sensors are REPORTS, not eyesight.** A base brain perceives through the knowledge economy
  (AI_INTELLIGENCE §4): witness sightings, patrol logs, rumor. The worked trace — a player pirate anchors
  near a marine base: sightings flow in as knowledge events → the commodore's beat scores
  {ignore, raise_alert, dispatch_scout, dispatch_patrol, request_reinforcement(↑), post_bounty} → INT gates
  the quality (INT 3 ignores rumors then overreacts to a raid; INT 8 cross-references reports, scouts first,
  escalates proportionally — and its escalation is what the PLAYER experiences as "the world noticing me").
- **Orders bias, never puppet.** Subordinates keep their own full pipeline — an ordered unit still retreats
  when its own scoring screams (the L4D-Director lesson). `request_reinforcement` is the one non-bias: an
  escalation event UP the parent chain (squad → division → fleet → base → territory).
- **Cadence decouples by scope** — and this IS the sim-LOD plan (adoption-tiers #4) arriving early. Today's
  squad tokens are a hard mutex the bias model replaces softly; they retire in phase 3.
- **The player is a commander too** (the Moat at the command layer): the strategic-command endgame UI issues
  the same order verbs AI leaders score — one vocabulary, no player-only order system. Possess the
  commodore and the base's menu is yours.

**Hard question — *what is the bias ALGEBRA under multi-membership?*** `parentId` is singular, but a real
unit answers to many masters at once: squad order + crew loyalty + personal agenda + personality clamps +
the arbiter's domain pick. Are biases summed, prioritized, or clamped — and what stops three stacked
"bias, never puppet" nudges from puppeting IN AGGREGATE? Corollary: when a unit refuses a player's order
because its own scoring screamed, how does the player learn WHY — refusal without a bark reads as a bug,
not autonomy (§7.3 owns legibility; passes §12.4/§12.5 must design the answer before phase 3 ships).

## 6. The gym — offline tuning as a content pipeline

**Full design: `AI_GYM.md`** (target-profile calibration — maximize INT 10, CALIBRATE 1–9; the scenario
matrix + opponent league; the same-kit ladder gate; the `HeadlessSim` extraction prerequisite). The short
version: the weight rows per (archetype × INT) are TUNED, not hand-guessed — a headless harness (the vitest
sim pattern, scaled) runs thousands of seeded matchups, an optimizer adjusts weights within authored
constraints, and results ship as def rows — checked-in content. Policy is already canon
(AI_INTELLIGENCE §8): runtime learning is banned; ML is an authoring tool. Foundation-side rules:

- **Personality clamps are constraints on the optimizer, not suggestions** — tune WITHIN character (the
  berserker's retreat weight is bounded low), or optimization flattens every archetype into one optimal
  coward. Clamps first, tune second.
- **The gym optimizes a working machine; it never rescues a broken one.** The scorer must feel right
  hand-tuned before the first gym run. (Guardrail, not schedule advice — see §10.)
- **Why we can and others can't:** offline tuning requires a deterministic, headless, seeded sim — the thing
  this codebase paid for from day 0 and most teams cannot retrofit. The gym is the foundation's dividend.

**Hard question — *does bot-calibrated transfer to human-felt?*** The ladder gate proves INT N beats N−1
same-kit vs BOTS; the moat claim is about how it feels to a PERSON, and humans exploit in shapes the league
never produces. Two sub-risks: weights overfitting the league (holdouts mitigate, don't prove), and
clamp-boundary collapse — if the optimizer pushes every archetype's solution ONTO its clamp walls,
"personality" degenerates into the clamp author's guess. Resolution rule, stated now: when gym bands and
hand-feel disagree, hand-feel WINS and the target profile gets re-authored — the gym tunes toward taste,
never overrules it.

## 7. Three laws of the foundation

1. **Commitment (anti-twitch).** Intents and micro-decisions carry `until` + abort conditions; scoring and
   ALL decision randomness (pick temperature, jitter, gambles) run at DECISION POINTS only — never per tick.
   Hard-won law (the per-pixel-mirroring kiter, the 40%-gamble-that-fired-at-95% bug): a per-tick Bernoulli
   is a re-roll-until-it-hits; per-tick scoring is a seizure. Restraint is most of what reads as intelligent.
2. **Determinism.** Every decision roll on the seeded `ai` stream; every combat resolution on `combat`.
   Replays, the gym, and multiplayer all die on one stray `Math.random` in a decision. (Cosmetic variant
   picks that touch no hitbox/phase stay presentation-side by the existing canon.)
3. **Perceivability.** Intelligence is only a moat if players can SEE it (AI_INTELLIGENCE §9.2 owns the
   design; this is the architecture-side consequence): committed behavior is legible behavior; every INT band
   needs a visible signature (the INT-2 hesitation, the INT-8 deliberate flank); variant pools exist to fight
   "every rush looks identical"; and execution dials (telegraph length foremost) are the legibility knobs.

**Hard question — *is `abortOn` authorable, or re-scoring in disguise?*** A committed intent is exactly as
smart as its abort list, and the world generates unlisted surprises (the fire patch spawns mid-retreat; the
target teleports away). Too few aborts = committed stupidity; a generic "re-score when the world changed
enough" trigger = per-tick evaluation through the back door, and law 1 dies quietly. Current bet: a small
CLOSED set of abort kinds (target lost / dest unreachable / own-HP band crossed / new threat class) as data
per intent. The falsifier: if content keeps demanding bespoke abort predicates, the law needs an amendment —
not silent exceptions.

## 8. Worked scenarios (the ladder, felt)

Shared probe in each: *you feint a heavy swing, then duck behind a crate.*

- **INT 2, dock thug, cutlass.** Menu after gate: rush/retreat/wait/guard. Sensors: distance + own HP, 2s
  memory. Rush scored on distance alone; hot temperature occasionally picks `wait` (visible hesitation —
  seeded, replays identically). Dials: 0.4s reaction, long telegraph, no cancel — completes the whiff you
  sidestepped. The probe: can't read windups, eats the real hit; forgets you 2s behind the crate. A bull.
- **INT 5, the Marine Officer, marine musket** (shipped — the reference implementation). Kit roles: Buckshot
  `ai.role.pointBlank`, Shock Kick `ai.role.disengage`. Menu: kite_shoot/aimed_shot/reposition/the
  point-blank gamble/disengage/retreat/guard — no take_cover, no feint, no punish. Sensors add your velocity
  (lead that fades close) and 5s memory (investigates last-seen). The beat loop IS the commitment contract.
  The probe: rolls his guard dice, sometimes blocks, never punishes the feint; walks to your corner but
  stands in the open. His ceilings ARE INT 5.
- **INT 8, pirate captain + fruit + a squad.** Full menu. Sensors: your exertion, counted dodge cooldown,
  in-fight habit memory (you parried 3 of 4 heavies), terrain, squad state. Scoring: your parry habit lifts
  `feint_attack`; her weights BANK `flame_dash` until cornered (dumb units spend the escape as a toy). Cold
  temperature — consistency reads as intent. Command tick: biases two grunts to flank left while she ignites
  the chokepoint behind you (#16's substrate). The probe: reads the cancel, doesn't bite, punishes YOUR feint
  recovery. Same scorer as the thug — richer inputs, colder pick, one integer apart.

Brain code written per scenario: **zero.** The only new *engineering* hiding above is `take_cover` (needs
the LoS/cover candidate generator) and `ignite_terrain` (needs #16) — verbs paid once, free for everyone
after.

**Hard question — *the blind test: can a player actually TELL?*** These scenarios are authored best-cases.
The falsifier that matters: equal kit, equal HP, a playtester fights INT 5 then INT 8 — do they attribute
the difference to INTELLIGENCE, or to stats/luck? If they can't tell (or misattribute), perceivability
(§7.3) has failed no matter how real the internal difference is — and the fix budget goes to barks,
telegraphs, and signatures (§12.4), NOT to more scoring depth. Schedule the blind test the week phase 2
lands, not after.

## 9. Prior art — and what is genuinely novel

Every pillar shipped somewhere; the composition shipped nowhere (honest survey, 2026-07):

| Pillar | Shipped proof |
|---|---|
| decide → intent → execute | RimWorld (ThinkTree → Job → JobDriver — decomp on disk) |
| consideration/utility scoring | Dave Mark's IAUS (GW2 et al.); The Sims' scored motives |
| scored destination candidates | CryEngine Tactical Point System; Killzone 2 position scoring |
| small verb set → emergent tactics | F.E.A.R. (~a dozen actions + a planner) |
| orders as bias, not puppeteering | Left 4 Dead's Director; CoH-style squad autonomy |
| offline-tuned decision weights | Supreme Commander 2 (shipped offline-trained platoon nets); Drivatars; Tekken ghosts |
| LOD'd scope hierarchy | S.T.A.L.K.E.R. A-Life; RTS strategic/tactical splits |
| capability gating per creature | Dwarf Fortress intelligence tokens; RimWorld intelligence classes |
| one command pipe, player + AI | lockstep-RTS command streams; BWAPI/SC2 bot APIs (unheard of in action RPGs) |

**Genuinely novel (the moat, and the only research risk):** (a) per-unit INT as a first-class 10-level
CONTENT axis gating menus + sensors + considerations + dials; (b) the gym as a routine content pipeline
against one's own deterministic sim; (c) the same funnel recursing across every scale (maneuver → unit →
squad → territory). The risk shape is favorable: novelty lives in the SEAMS between shipped-proven pieces —
so integration, not invention, is where the schedule risk is. Study list: the RimWorld decomp
(`ThinkNode_Priority`, `JobGiver_AIFightEnemy`), Dave Mark's GDC talks + Curvature (github: apoch/curvature),
gameaipro.com's utility + tactical-position chapters.

**Hard question — *is the empty seam unexplored, or a graveyard?*** The honest alternative reading of
"everyone shipped a pillar, nobody the composition": teams that tried found tuning cost EXPLODES at the
seams — kits × INT × personalities × domains multiply, authoring hours don't. Our counter-bet is the gym +
engines-over-content. The canary, checkable early: hours-per-new-archetype must trend DOWN as content lands.
If the third archetype costs more than the second, we're on the wrong side of the curve — coarsen the ladder
(ship 5 felt BANDS tuned well over 10 tuned thinly; the 1–10 scale stays as data) before the curve decides
for us.

## 10. Phases, triggers, guardrails

Each phase is independently valuable and de-risked by a named shipped game; stopping at any phase still
leaves a better AI than the FSM.

- **Phase 0 — SHIPPED (2026-07, before this doc named it):** knobs → `AIProfileDef` data · ability ROLE tags
  replace slot-position coupling · commitment latches (beat loop, gamble latch, decide cadence) · the pure
  stance fn · seeded decision rolls. The marine is the reference implementation.
- **Phase 1 — the Intent component** (= the PlayerIntent keystone): one pipe, three writers; the kiter
  extracted as executor #1; player input writes intents. *Trigger: netcode work begins, OR phase 2 starts —
  whichever first.*
- **Phase 2 — the scorer inside `chase`:** ~6 coarse intents (engage / kite_shoot / reposition / retreat /
  guard / special) replace the branch ladder; the FSM keeps wander/alert as macro-states; menu gates +
  consideration gates + temperature land here, hand-tuned. *Trigger: the second complex archetype (the next
  ranged/tactical enemy after the marine) — the rule of three, not speculation.*
- **Phase 3 — command entities:** squad leader as a scope entity, orders as biases; tokens retire. *Trigger:
  squad content that tokens visibly can't express (feigned retreats, flanking orders).*
- **Phase 4 — the gym:** the tuning harness + first tuned weight tables. *Trigger: phase 2 feels right
  hand-tuned AND a real balancing need exists (≥3 archetypes × ≥3 INT bands live).*
- **Phase 5 — up the ladder:** fleets/bases/territory reuse the command component as #12 arrives; maneuvers
  and sensors accrete per content need, never ahead of it.

**Standing guardrails:** the gym never rescues (§6) · the commitment law is non-negotiable (§7.1) · build on
trigger, not enthusiasm · a maneuver/verb enters the library only when content demands it (no pre-authoring
the 30) · smart is never a wallhack (AI_INTELLIGENCE §9.3 — honest asymmetry).

**Hard question — *phase 2 rewrites a brain that already feels right: what's the acceptance bar?*** The
marine is both the reference implementation and the hostage — the scorer version must reproduce his feel or
beat it, and "feels the same" is not a test. The bar, named now: seeded replay scenarios (the vitest sim)
where the scorer marine matches the FSM marine's headline behaviors within bands (kite beat cadence, gamble
rate, disengage triggers), PLUS the developer's blind side-by-side. If the scorer loses, phase 2 STOPS until
it wins — we don't ship a regression to serve the architecture.

## 11. Performance stance

TypeScript is not the ceiling; architecture is the lever (settled 2026-07 against the Rust question):
decisions are dozens of float ops at ~1–2/s/unit, staggered — the pick is never the cost. The costs and
their levers: SENSORS → the shared spatial grid (SpatialQuery is already the declared single chokepoint to
swap); scope cadences (§5) → most brains tick rarely; INT as a sim-LOD dial (AI_INTELLIGENCE §9.4 — a dumb
unit is a cheap unit; distant units run the cheap rungs). 200 pawns at INT 7–10 is realistic in TS *because*
intelligence is table lookups over gym-tuned data, not live search. Language migration is the last resort
after these levers, and a hot-kernel (pathfinding) WASM split comes before any rewrite.

**Hard question — *the sensor bill is unproven: what's the per-pair math?*** The pick is cheap; SENSING
isn't. INT-8 sensors imply per-observed-pair state (habit counters, counted cooldowns) plus LoS queries —
200 mutually-observing pawns is ~40k pairs at worst. The unwritten budget: memory per pair, raycasts per
beat, and the CULL rule (pair-tracking only within a shared engagement — combat scopes, §5, are the natural
cap). Until that arithmetic is written against real numbers, "200 pawns at INT 7–10 is realistic" is a
stance, not a fact. The HeadlessSim extraction (AI_GYM §8) is where to measure it first.

## 12. Open design passes (the queue — what this trio references but does NOT design)

Each waits for its trigger (build-on-trigger guardrail); listed so the gaps live here, not in chat history.

**Early (phases 1–2 will hit these):**
1. **The PlayerIntent spec** — the PLAYER half of the intent vocabulary (input granularity: move intent
   shape, aim representation, press vs charged-hold). Phase 1 blocks on it; it IS the multiplayer keystone's
   spec. *The most urgent gap.*
2. **Perception/sensor model** — hearing (gunshots draw units — the witness system depends on it), alert
   propagation, the DATA SHAPE of memory (habit counters, counted cooldowns), attention/blind-window
   modeling (the Alien: Isolation research gap AI_INTELLIGENCE §11 flags). Stealth gameplay lives here.
3. **Cover & tactical positions** — the first new verb (`take_cover`): what blocks a shot (half-answered by
   `Collision.shotBlockedAt`), the position-candidate query (the CryEngine-TPS analog, feeding §4's
   generators), peek behavior; the seam with `../PATHFINDING.md`'s danger maps.
3b. **Ability targeting KINDS + the cell targeter** — the ~5 targeting kinds (entity / direction /
   point-area / cell / self) as `AbilityDef` data; the cell targeter is §4's candidate machinery consumed by
   CASTING — place-the-barrier/ignite-the-chokepoint = generate cells, score, then CAST at the winner
   instead of walking to it. One targeter per kind, consideration sets per ROLE tag, zero per-ability
   brains. *Trigger: the first tile-channel ability (a terrain-writing fruit — backlog #16).*
4. **Barks + INT signatures** — perceivability as CONTENT: what each INT band visibly does (the INT-2
   hesitation, the INT-8 deliberate flank) and the bark system narrating decisions (F.E.A.R.'s real secret).
   Cheapest big win in the program.

**Mid (phase 3 / the crew era):**
5. **Combat-command content** — the order verbs' semantics (what `feigned_retreat` actually biases),
   formations, DIVISION-level war verbs (commit/refuse squads, sacrifice delays), token retirement.
6. **The knowledge component** — the data model under AI_INTELLIGENCE §4: entry schema, acquisition/decay,
   capacity by INT, propagation events over the EventBus. Blocks backlog #6 (witnesses) and #9's NPC half.
7. **The LIVELIHOOD domain + the domain ARBITER** — jobs/needs/schedules (crew roles doing their JOBS,
   backlog #1; civilian routines, needs #18 time; vendors) AND the arbiter that switches a body between
   domains (§5) — they land together, because the arbiter only becomes real when a unit has a second domain
   to be interrupted FROM. Generalizes the wander/alert/chase FSM.
7b. **The SOCIAL domain** (backlog #17's AI half) — recruit/threaten/bribe/befriend/betray intents, morale +
   loyalty state, mutiny as a scored decision. The interaction web's verbs already exist as player actions;
   this pass gives NPCs the same menu (the Moat, socially).

**Late (with their backlog owners):**
8. **Operational base brains** (backlog #15 — marine hierarchy): the commodore's menu (§5's worked trace) —
   patrols, alert doctrine, investigations, bounty posting, proportional escalation. This is "the world
   noticing you" made real, and the first persistent scope to ship.
9. **Campaign brains** (backlog #12): what a Yonko decides over — raid targets, alliances, tribute/economics,
   promotions, wars — and how those intents spawn fleets (§5: persistent brains spawn transient chains).
10. **Nemesis persistence** (backlog #6): what of a rival's model-of-you survives an escape, and the offline
    "trains against you" lifecycle (scar → promotion → pre-countered return).
11. **Off-screen abstract resolution** — statistical outcomes for distant engagements (two squads meet
    off-screen: who wins, WITHOUT running combat) — the "world doesn't wait" pillar's quiet prerequisite;
    distinct from tiered ticking, undesigned anywhere.

**Hard question — *the queue's own trap: can #1 be specced first when it's needed first?*** PlayerIntent is
the most urgent gap AND the wire format netcode will freeze — but its vocabulary is only validated once the
AI scorer (phase 2) consumes the same intents, and the aim/cover shapes (#2, #3) feed it. Lock it early and
we risk a breaking wire change later; lock it late and netcode blocks. Resolution: spec #1 with an explicit
VERSIONED envelope and mark which fields are provisional until phase 2 consumes them — design the churn in
rather than pretending it won't come.
