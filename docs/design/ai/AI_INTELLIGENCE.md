# Ballpiece — AI Intelligence (the INT axis)

> Design capture, ahead of the code. Companions: `AI_FOUNDATION.md` (the decision-engine ARCHITECTURE that
> executes this axis — the pipeline, executor recursion, command scopes, the gym, build phases),
> `../DEEP_SIMULATION.md` (the runtime/scale side of AI),
> `../REFERENCES.md` (#5 Nemesis · #9 squads · #12 director · #13 bounty · #26 agent needs),
> `../../references/rimworld-simple/08-ai-thinktrees-jobs.md` + `adoption-tiers.md` (S#2 intent split, A#14 duty),
> `../../references/library/` (F.E.A.R., Sims 3, Game AI Pro — the shipped-AI evidence base).
> Code seeds today: `defs/aiProfiles.ts`, `ai/perception.ts`, `ai/Brain.ts`/`brains.ts`, `systems/SquadSystem.ts`.

## 1. Thesis

**Intelligence is a simulated quantity, like HP.** One stat — **INT 1–10** — is the axis that turns the same
game systems into completely different opponents. Not ten difficulty scripts, not ten AI models: **one AI
stack** where INT gates the *quality of every stage* — what a unit perceives, what it knows, how it decides,
how well it executes, and whether it commands others. Fighting INT 2 and INT 8 uses identical rules and
identical fairness, but feels like fighting a different species.

In one sentence: *INT scales perception, knowledge, decision quality, execution, and command across all three
scales of the game — fed by a living information economy, expressed through the same four-layer combat rules,
tuned offline in the headless sim — so climbing from F-tier to Yonko means outgrowing ever-smarter minds, not
ever-fatter health bars.*

## 2. The pipeline INT gates

Every unit runs the same five stages; INT sets the quality of each. All knobs live on `AIProfileDef` rows
(canon: AI knobs are data, never global consts).

| Stage | INT 1 (noob) | INT 10 (tactician) |
|---|---|---|
| **Perceive** | short radius; forgets you out of LoS; can't tell feint from attack | tracks last-known-position; hears distant fights; **models your attention** — acts in your blind windows |
| **Know** | knows nothing; walks into a Logia fight bare-handed | informed: your fruit, your crew's weak flank, that Armament beats you (§4) |
| **Decide** | attack-spam reflex | plays the *encounter*, not the fight: baits, ambushes, disengages, returns countered (§5) |
| **Intend/Execute** | telegraphed, mistimed, panics; honest input handicaps (reaction delay, aim error — `reaction` aim-lag already exists) | frame-tight dodges, spacing/stamina discipline, feints of its own — better inputs, **never wallhacks** |
| **Command** | none — mob behavior | runs squads: formations, focus fire, flanking routes, feigned retreats (§6) |

## 3. The INT ladder (capability gates, not stat buffs)

- **INT 1–2 — reflex.** Attack-spam, no dodging, no retreat, near-zero awareness. Dies informatively.
- **INT 3–4 — competent.** Target selection, kiting, basic dodge timing, terrain use, flees at low HP
  (wildlife `flee` state is the seed).
- **INT 5–6 — tactical.** Reads telegraphs, manages stamina/posture, uses cover and consumables, retreats
  *through* allies, calls nearby reinforcements.
- **INT 7–8 — strategic.** Squad command; knowledge-driven counter-picking of your layers (gun vs sword
  range games, Haki vs Logia); reads your habits (§5); picks *when* to fight — including when you're not
  aware; feints.
- **INT 9–10 — mastermind.** Campaign-level play: manipulates encounters (ambush chains, cutting escape
  routes, sacrificial delays), fights only on chosen ground, targets what you protect. Admiral/Yonko tier.

Each rung = a set of **capability gates + knob curves** on `AIProfileDef` (e.g. `canFeint: INT≥7`,
`reactionLag: curve(INT)`), so a new tier is data, and any unit — fish, marine, rival captain — sits anywhere
on the ladder.

## 4. Knowledge is data — the information economy

A smart enemy isn't just quick; it's **informed**. "Knows your devil fruit", "knows Armament beats Logia",
"knows the east reef shortcut" are *knowledge entries* — acquired by observing, surviving, or hearing.
Knowledge **propagates through the living world**: survivors report to their faction, bounty posters and news
coos broadcast it, factions brief their hunters. INT gates how fast a unit acquires knowledge, how well it
applies it, and whether it shares it.

Emergent gameplay falls out unscripted: **kill the witnesses before your fruit becomes public**, or embrace
infamy and face pre-countered hunters. Death of informed units = knowledge lost; information becomes something
you can raid, protect, and assassinate. (This is EVENTS.md reputation, generalized from a number to a graph.)

## 5. Counter-play — statistics presented as genius

"It understands my combat style" = **frequency counters as data**: brains track your habits (parry-heavy?
gatling spam? same Haki opener?) and INT 7+ weights decisions against them. Deterministic, serializable,
per-unit — canon-compatible, no ML required. Runs at layer granularity: fruit, weapon class, and style each
get read and countered.

Plugs directly into **Nemesis rivals** (REFERENCES S#5): a rival who escapes keeps their model of you, trains
against it, and returns *built to beat the you they remember* — scarred, promoted, and pre-countered.

## 6. Intelligence at three scales (mirrors the command loop)

- **Unit INT** — everything above.
- **Leader INT** — a captain's INT sets *squad* quality via duty dispatch (SquadSystem writes duties;
  personal brains defer — never two brains fighting). Same soldiers + smarter captain = different battle.
  The F.E.A.R. lesson applies: squad genius should *emerge* from a few coordinated simple behaviors + barks,
  not from scripted set-pieces.
- **Faction INT** — the Kenshi layer: AI captains and Yonko run their own campaigns on the strategy map with
  the same axis — when to raid, whom to ally, which island to take. The player is not the only one climbing
  F-tier → Yonko; and control-as-a-component means you can possess any of them.

## 7. Personality × INT — two INT-7s are not clones

INT = *how well* it plays. Personality knobs (aggression, caution, honor, cruelty — `AIProfileDef` fields
like everything else) = *what it wants*. A cautious INT 8 blockades and sieges; a reckless INT 8 boards and
duels brilliantly. The facet split also buys the One Piece archetypes for free: a Luffy-type boss is
low-planning / instinct-maxed (top-tier execution, mid decision), a Kuzan-type is the inverse.

## 8. Machine learning — offline only (policy)

**Runtime learning is banned**: it breaks determinism, saves, and multiplayer — non-negotiable canon.
The legitimate ML door is the one the headless deterministic sim already opens: **offline optimization** —
run thousands of headless auto-battles to tune INT-tier utility weights, evolve squad tactics, and
balance-test counters, then **ship the results as def data**. ML as a content-authoring tool, never a runtime
brain. 🧊 far-future flavor: Drivatar-style ghost profiles of real players as rival templates.

## 9. Guardrails (what keeps this the Moat, not the frustration)

1. **INT ≠ stat inflation.** INT 10 is beatable by reads and skill — never a gear/level check. Bounty
   escalation (#13) sends *smarter* hunters, not fatter ones — a scarier and fairer difficulty curve.
2. **Smart must be legible.** Higher INT telegraphs less and feints more, but signals intent enough that
   dying to it teaches you something. F.E.A.R.'s real secret was barks narrating decisions; perceived
   intelligence is mostly communication.
3. **Honest asymmetry.** Low INT = degraded inputs (delay, error, radius); high INT = better inputs +
   policies + knowledge. No tier ever gets information the sim didn't give it.
4. **Don't simulate everything** (REFERENCES meta): full pipelines for combat-relevant units; distant/low-INT
   units run the cheap rungs — INT is also a **sim-LOD dial** (a dumb unit is a cheap unit; DEEP_SIMULATION
   §6's tiered ticks apply per-INT).

## 10. Architecture mapping (lands as data + small systems)

- **Prerequisite:** the decide/execute **intent split** (`adoption-tiers.md` S#2) — INT-gated decisions need
  inspectable intents; also the PlayerIntent/multiplayer keystone. Build first — **now fully designed as
  `AI_FOUNDATION.md`** (the pipeline, one intent pipe, executor recursion, command scopes, the gym, phased
  build triggers). That doc owns the architecture; this one owns what INT means.
- **Exists today 🌱:** `AIProfileDef` knobs (reaction aim-lag = the first honest-handicap knob),
  `ai/perception.ts`, FSM brains + `flee`, `SquadSystem`, PowerTier/bounty, faction matrix.
- **INT adds 🔨:** an `int` field + capability gates/knob curves on `AIProfileDef` · a `knowledge` component
  (entries by id, serialize-by-id) · habit counters on combat brains · duty-quality scaling by leader INT ·
  knowledge-propagation events over the typed EventBus (news coo = an event director consumer).
- **Far 🧊:** faction-INT campaign AI (with DEEP_SIMULATION §6b), offline tuning harness, ghost profiles.

## 11. Evidence base (why we believe each piece ships)

- Planner-grade "knows when to" with one programmer: **F.E.A.R. GOAP** (library: gdc-talks §4).
- Personality-as-data at AAA scale: **Sims 3 utility AI** (library: gdc-talks §5).
- Squad emergence over scripting: **F.E.A.R.'s four squad behaviors** (same source).
- "Knows when you're not aware": **Alien: Isolation** two-brain director — *library gap, next research pass*.
- Intelligence-gated capability sets: **RimWorld** (Animal/ToolUser/Humanlike gating — rimworld-simple ch 03).
- The BT/utility toolbox for the decide stage: **Game AI Pro** chapters (library: books §2–3).
