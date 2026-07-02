# Glossary — RimWorld terms in one line each

> rimworld-simple atlas · chapter references in parentheses.

| Term | Meaning |
|---|---|
| **Def** | An immutable content row loaded from XML (a weapon type, a disease, a faction kind). (01) |
| **DefDatabase\<T\>** | The static registry holding all defs of one type. (01) |
| **DefOf** | A class of static typed fields auto-bound to well-known defs by field name. (01) |
| **defName / short hash** | A def's unique string id / its compact 16-bit save id. (01, 16) |
| **Thing** | Any in-world object: item, building, pawn, projectile, plant. (02) |
| **Comp / CompProperties** | A pluggable behavior module on a Thing (or hediff/ability) / its per-def config. (02) |
| **Stuff** | The material a thing is made of (steel, wood) — multiplies its stats. (04) |
| **Pawn** | Any creature — colonist, raider, animal, mech. One class for all. (03) |
| **Tracker** | One of a pawn's ~50 sub-objects owning a state slice (`health`, `jobs`, `needs`…). (03) |
| **PawnKindDef vs race** | Spawn template (Pirate) vs species biology (Human ThingDef.race). (03) |
| **Stat / StatWorker / StatPart** | A queryable number def / its compute pipeline / a pluggable contribution. (04) |
| **Hediff** | "Health-diff": anything on a pawn — wound, disease, buff, bionic. THE effect object. (05) |
| **Severity / HediffStage** | The one number driving an effect / the threshold band of modifiers it selects. (05) |
| **Capacity** | An aggregated body function (consciousness, moving); zero on a vital one = death. (05, 06) |
| **Verb** | Any executable attack/cast: melee swing, gunshot, psycast — one abstraction. (06, 07) |
| **DamageInfo / DamageWorker** | The damage parameter object / the strategy that applies it. (06) |
| **Ability** | An activated power: def + instance + list of effect comps, cast through a verb. (07) |
| **ThinkTree / ThinkNode** | A pawn's decision behavior-tree in XML / one node worker in it. (08) |
| **Job / JobGiver / JobDriver** | An intent as data / the leaf that emits it / the executor running it. (08) |
| **Toil** | One resumable step inside a JobDriver (go there, wait, act). (08) |
| **Lord / LordToil / Duty** | A squad brain / its current state / the order written into each member. (08) |
| **Need / Thought / Mood** | A decaying bar / one mood contribution (pushed memory or polled situation) / their aggregate. (09) |
| **Mental state / break** | AI hijack when mood crosses a threshold (berserk, wander). (09) |
| **WorkGiver / Bill / RecipeDef** | A "findable work" strategy / a queued crafting order / what crafting means. (10) |
| **Designation** | A player-painted map marker that WorkGivers consume (chop this, mine that). (18) |
| **Faction / goodwill / FactionRelationKind** | A group actor / its −100..100 relation score / Hostile-Neutral-Ally. (11) |
| **HostileTo** | The single function answering "is X my enemy". (11) |
| **TickerType (Normal/Rare/Long)** | How often a thing ticks: every 1 / 250 / 2000 ticks, hash-staggered. (12) |
| **IsHashIntervalTick** | Per-entity staggered periodic check inside per-tick code. (12) |
| **Rand.PushState** | Scoped deterministic RNG bracket. (12, 15) |
| **Region / District / Room** | Connected passable chunk / group of regions / enclosed space — the spatial hierarchy. (12, 18) |
| **Storyteller / StorytellerComp** | The event director personality / one cadence strategy inside it. (13) |
| **Incident / IncidentParms / threat points** | One dynamic event / its generic parameter bag / the difficulty budget. (13) |
| **Quest / QuestNode / QuestPart / Slate** | A runtime quest / a generation-time builder / a runtime listener / the generation variable bag. (14) |
| **Signal** | A string-tagged event quests listen to. (14) |
| **GenStep / WorldGenStep** | One ordered step in map / world generation. (15) |
| **BaseGen / SymbolResolver / Sketch** | The structure grammar engine / one expansion rule / a blueprint-in-memory. (15) |
| **Scribe / IExposable / ExposeData** | The save system / its one-method contract / the method that runs in both directions. (16) |
| **LoadID / cross-ref pass** | An object's save-file identity / the second load pass wiring references. (16) |
| **Gene / Xenotype** | One Biotech trait-unit granting stats/abilities/hediffs / a named gene bundle. (17) |
| **Precept / Meme / Ideo** | One belief rule / a belief theme / a whole belief system. (17) |
| **HistoryEvent** | A "this happened, because-tagged" record on the event bus; precepts/goodwill react. (11, 17) |
| **DefModExtension** | Typed data a mod attaches to any existing def without subclassing. (18) |
| **PatchOperation** | XPath surgery a mod applies to def XML before parsing. (18) |
| **Gizmo / ITab / Alert / Letter** | Selected-thing button / inspect tab / polled sidebar warning / event notification. (18) |
| **Fleck / Mote / Effecter** | Struct-based one-shot particle / its old class-based ancestor / a composed multi-part effect. (18) |
| **RulePack / GrammarResolver** | A text-grammar fragment def / the weighted expander (names, battle logs). (18) |
| **StockGenerator** | Procedural trader-inventory roller on a TraderKindDef. (18) |
| **Find / Current** | The read-only static facade into the state tree / its mutable holder. (00) |
| **GameComponent (World-/Map-)** | Auto-instantiated plugin slot ticked and saved with its owner. (00, 17) |
| **Long event** | A queued slow operation behind a loading screen (boot, mapgen, save). (00) |
