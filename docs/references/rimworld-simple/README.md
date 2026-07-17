# rimworld-simple — the big-picture atlas of RimWorld's architecture

A ~20-file distillation of RimWorld 1.6's codebase (9,217 decompiled classes) into its ideas, architecture,
and design patterns. Written for both humans and AI agents working on **openpiece**: read this first to know
*what exists and how it fits*, then follow the file pointers into `..\rimworld-decomp\` only when a detail
matters.

**Provenance:** distilled 2026-07-02 from the decompiled RimWorld 1.6 (build 9676) source in
`..\rimworld-decomp\` and the XML defs in `..\rimworld-data\`. That code is Ludeon Studios' copyright — this
atlas records patterns and pointers, never copied code. Decompiled line numbers are approximate.

## How to use

- **First read:** `00-big-picture.md` (the layer cake and state tree), then `19-patterns-catalog.md` (every
  recurring trick, named — the chapter to read if you read only one).
- **Task routing:** the "Where does X live?" table at the end of chapter 00.
- **Per chapter:** idea in 3 sentences → key classes → data flow → patterns → gotchas → go-deeper pointers.
- **Openpiece verdicts** live beside this file: `adoption-tiers.md` — every pattern tiered S/A/B/C/D by
  worth/fit for openpiece, with milestone triggers — and `others.md` — the deep adopt/skip analysis of the
  six core subsystems. The atlas describes RimWorld; those two decide what openpiece takes.
- **Head-to-head verdict:** `openpiece-comparison.md` (2026-07) — which codebase is closer to best practice
  and which better supports complex systems, dimension by dimension, adversarially reviewed; includes the
  confirmed-defects list and the prioritized steal list.
- **Path note:** `..\rimworld-decomp\` / `..\rimworld-data\` references in the chapters point to the
  decompiled source, which stays *outside* the repo at `C:\Files\Phaser\References\rimworld\`.

## Chapters

| # | File | Depth |
|---|---|---|
| 00 | big-picture — layers, state tree, two clocks, routing table | deep |
| 01 | def-system — content is data: load pipeline, inheritance, cross-refs, DefOf | deep |
| 02 | things-and-comps — the object model; composition without an ECS | deep |
| 03 | pawn-anatomy — aggregate root, capability-gated trackers, race vs kind | deep |
| 04 | stats — offsets→factors pipeline + the explanation mirror | deep |
| 05 | health-effects — the Hediff engine: severity, stages, comps | deep |
| 06 | combat-resolution — verbs, projectiles, armor; damage = hediffs on parts | deep |
| 07 | abilities — activated powers as effect-comp lists over verbs | deep |
| 08 | ai-thinktrees-jobs — decide/execute split, toils, Lord/Duty squads | deep |
| 09 | needs-moods-social — thoughts (push/poll), mood, breaks, opinions | summary |
| 10 | work-and-bills — the WorkGiver scan pattern; recipes | summary |
| 11 | factions-relations — goodwill thresholds + the one HostileTo oracle | summary |
| 12 | tick-performance — tick buckets, scoped RNG, spatial indexes, dirty caches | deep |
| 13 | storyteller-events — the three-layer event director + threat points | deep |
| 14 | quests — generation-time node graph vs runtime signal listeners | summary |
| 15 | world-and-mapgen — GenStep pipelines + BaseGen grammar expansion | deep |
| 16 | save-load — the Scribe system: one method, both directions, three passes | deep |
| 17 | dlc-as-extensibility — genes/precepts/entities as proof the hooks scale | summary |
| 18 | everything-else — UI, trade, research, text-gen, mods, FX, debug, pathing | mention |
| 19 | patterns-catalog — the cross-cutting index (25 patterns + 5 OOP mechanisms) | deep |
| — | glossary — every term in one line | — |

## Coverage manifest

Every class family in the decomp with ≥15 members, mapped to its owning chapter. "Is X covered?" is
answerable here; anything absent is either below the threshold (grep the decomp directly) or listed in the
gaps note below.

| Class family (count) | Chapter |
|---|---|
| CompProperties (359), Building (87) | 02 |
| JobDriver (302), JobGiver (242), ThinkNode (126), LordToil (87), LordJob (71), Trigger (47), Toils (21), LordToilData (20) | 08 |
| QuestNode (301), QuestPart (244), QuestGen (17), SitePartWorker (33 — quest sites), ThingSetMaker (22 — reward item-sets), Reward (16) | 14 |
| ThoughtWorker (238), Thought (43), MentalState (41), MentalStateWorker (18), Need (20), InteractionWorker (18), PawnRelationWorker (26), JoyGiver (18) | 09 |
| WorkGiver (143), Recipe (23), SpecialThingFilterWorker (48 — bill/storage filters) | 10 |
| Alert (132), Dialog (123), Designator (81), ITab (39), Command (28), MainTabWindow (15), FloatMenuOptionProvider (53), PawnColumnWorker (53), Instruction (22 — tutorial steps) | 18 §1/§7 |
| SymbolResolver (118), GenStep (111), TileMutatorWorker (69), RoomContents (56), SketchResolver (33), RoomRoleWorker (23), RoomPart (21), BiomeWorker (19) | 15 |
| IncidentWorker (95), StorytellerComp(Properties) (23+23), GameCondition (32 — incident-made conditions) | 13 |
| HediffComp (77), HediffCompProperties (69), Hediff (48) | 05 |
| CompAbilityEffect (77), Verb (38), CompUseEffect (17 — item-triggered effects) | 07 / 06 |
| StatPart (73), StatWorker (27) | 04 |
| Pawn (55 — the trackers) | 03 |
| RitualOutcomeComp (31), PsychicRitualToil (24), RitualObligationTargetWorker (21), RitualOutcomeEffectWorker (19), PsychicRitualDef (17), RitualPosition (16), StageEndTrigger (15), PreceptComp (15) | 17 (Ideology/Anomaly ritual machinery — the def+comp+worker triple applied to ceremonies) |
| Graphic (43), PawnRenderNodeWorker (27), PawnRenderNode (20), SectionLayer (26), WorldDrawLayer (22), WeatherOverlay (20), SubEffecter (20) | 18 §6 (presentation/rendering) |
| PlaceWorker (74 — building-placement validators: def+worker again) | 19 pattern #2; consumers in 18 §1 |
| StockGenerator (15) | 18 §2 |
| LanguageWorker (18 — per-language grammar for localization) | 18 §4 note |
| ScenPart (43 — scenario config: new-game rules as a def+parts list, consumed at InitNewGame and via Scenario stat/incident hooks) | 00 (new-game walk) — thin coverage, see gaps |

**Known thin spots** (deliberately, low architectural novelty): the scenario system (ScenPart — same
def+parts shape as quests, applied to game setup), the tutorial system (Instruction_*), and localization
(LanguageWorker). Each reuses patterns from chapter 19; consult the decomp directly if needed.

## Source folders (outside the repo, at `C:\Files\Phaser\References\rimworld\`)

- `rimworld-decomp\` — full decompiled C# (Verse\, Verse\AI\, RimWorld\, RimWorld.Planet\, …)
- `rimworld-data\<Expansion>\Defs\` — the XML content database (Core + 5 expansions)
- `rimworld-source\` — Ludeon's official partial source, with original comments
