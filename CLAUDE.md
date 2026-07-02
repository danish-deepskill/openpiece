# Ballpiece — Claude Code Context

A **One Piece-inspired open-world action-RPG** (Rell Seas / Necesse / OSRS-like systems). Fresh, clean
Phaser + TypeScript + ECS build under `app/`. The old prototype (`docs/references/grand_voyage.html`) is a
**behavioral reference only** — not built upon. Long-term vision: a **living, deeply-simulated sea** (Kenshi-tier world sim) you rise
through from F-tier nobody to Yonko — strategic command + possess-any-unit — eventually multiplayer
(**ballpiece.io**, server-authoritative). The architecture decisions below exist to serve that endgame.

## Working agreements (how the developer works — don't make him repeat these)
The developer-side half of this contract is `docs/WORKING_WITH_CLAUDE.md` (request template, shared
vocabulary, session rituals) — point him there if he asks "how should I phrase this?", and honor the
promises it makes on Claude's behalf (restate → read code → honest verdict → smallest canon change →
knobs + playtest list → gates).
- **Verify = `npm run typecheck` + `npm test`** (from `app/`), plus `npx vite build` when the bundler is
  touched. **Never Playwright/browser automation** — visual/feel checks are the developer's job; tell him
  WHAT to look at in one short list.
- **Commit only when he explicitly asks.** Offer a checkpoint after big green milestones; don't just do it.
  Style: imperative summary + a body saying WHY; feature-scoped commits (don't fuse unrelated work); gates
  (typecheck + tests) must be green, and run `/check-canon` first on nontrivial diffs.
- **Build foundation, not hotfix.** Behavior knobs go on Defs/profiles (data), not inline constants; a fix
  that dodges the pattern is a bug. When a request exposes a structural gap, say so and propose the
  foundation version.
- **Scope discipline:** change exactly what was asked. Don't "improve" neighboring things unasked (asking
  for a knife visual must not restyle the cutlass). Flag adjacent issues instead of fixing them silently.
- **He tunes feel himself.** Land the mechanism with reasonable numbers, then point at the knobs (file +
  const/def field). Expect him to hand-adjust visuals/geometry — read files before editing after his turns.
- **Be a senior, not a yes-man.** He asks "is this good design?" often — give the honest verdict with the
  trade-offs, and push back when a request conflicts with the canon (he usually agrees or overrides
  deliberately). Cherry-pick external advice (courses/references) against THIS codebase's goals; most
  OOP/engine-coupling advice doesn't fit and should be rejected with reasons.
- **Explanations:** he's learning engineering practice — when he asks "why/what/is it worth it", answer with
  the concept first, mapped to ballpiece second, with concrete numbers where possible. Concise > exhaustive.

## Required reading
- `docs/DESIGN_PATTERNS.md` — the coding-standards canon (principles, naming, ECS idioms, determinism, the
  sim/presentation boundary). Every change is reviewed against it.
- `docs/ARCHITECTURE.md` — ECS-lite foundation: components, systems, the **data-driven faction matrix**, and
  **control-as-a-component (the Moat — the player is not special)**. Read before changing architecture.
- `docs/ARCHITECTURE_SCALE.md` — how the foundation scales to the full vision: content **Registries**,
  **GAS-lite combat** (Attributes + Abilities + Effects + Tags), modifier stacking, world/zones, event
  director, persistence. Read before designing a new system.
- `docs/design/` — the target vision (`VISION.md` first). Ahead of the code on purpose.
- `docs/references/rimworld-simple/` — the RimWorld 1.6 atlas: how EVERY RimWorld subsystem works (start:
  `README.md` + `19-patterns-catalog.md`), plus the ballpiece verdicts — `adoption-tiers.md` (all patterns
  tiered S/A/B/C/D with milestone triggers) and `others.md` (deep adopt/skip on the six core subsystems).
  Full decompiled source + XML defs for deeper digs: `C:\Files\Phaser\References\rimworld\rimworld-{decomp,
  data,source}` (patterns only — Ludeon copyright, never copy code).

## Tech stack
- Phaser **3.90** (Canvas), **TypeScript**, **Vite 5**, **Vitest**. Procedural Graphics (no sprite assets).
- Fixed 1280×720, `Scale.FIT`. Everything under `app/`.

## Key architecture decisions (don't violate)
- **Content is data, code is generic.** Fruits/weapons/items/abilities/zones/events/… are Defs in typed
  `Registry`s (`core/Registry.ts`). Definition vs Instance. No hardcoded content lists, no `if (name === …)`.
  (Ability/Effect rows currently live beside their engine in `combat/`; function-bearing strategy rows —
  `MOTIONS`, `Verbs`, `draws` — always do. A new weapon *silhouette* also needs a `visual.kind` draw case.)
- **One combat engine (GAS-lite).** The four layers (Devil Fruit + Haki + Weapon class + Fighting style) +
  Combat Potentials all grant **Abilities + Modifiers + Tags** into one engine. Stats only via
  `combat/StatBlock.ts` + `combat/Modifier.ts` (flat → addPct → mulPct → override, source-tracked).
- **The sim is engine-agnostic + deterministic.** No Phaser in `ai/ combat/ core/ defs/ ecs/ world/`
  (enforced by `app/test/architecture.test.ts`); sim randomness via seeded `core/Rng` streams; fixed
  timestep (`SIM_DT`). This keeps headless-server/multiplayer/replay open — never trade it away.
- **Factions = data-driven relations matrix** (`defs/factions.ts`); never team checks.
- **Control = a component.** `InputSystem` drives `world.first('control')`; possess any character.
- **AI = `Brain` strategy** (FSM now → behavior-tree/utility later). Logic in `systems/`, not scenes.
- Typed **EventBus** for discrete events; **registry** for HUD state; **pool** transient FX.

## Commands (run from `app/`)
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm test`
- In-game debugging: **backtick (`)** opens the Debug flag panel (`core/Debug` + `systems/DebugOverlay`) —
  overlays for AI state/paths/vision, combat reach, squad tokens, perf. Use it (via the developer) before
  guessing at AI/combat bugs; combat feel knobs live on `AbilityDef.shape` + `config/constants.ts`.

## Task → doc map (open the right one instead of re-deriving)
- Writing/reviewing **code** → `docs/DESIGN_PATTERNS.md` (§12 = the checklist) + `.claude/rules/*`
- New **content/def/system** → `/add-def` or `/add-system` skills (they encode the house pattern)
- **Combat design** (stamina/posture/parry/telegraph plans) → `docs/design/COMBAT.md`
- **Vision & future systems** (Yonko/strategic layer, deep sim, multiplayer stack, world structure)
  → `docs/design/DEEP_SIMULATION.md`; idea tier list → `docs/design/REFERENCES.md`;
  **AI intelligence design** (INT ladder, knowledge economy, counter-play) → `docs/design/AI_INTELLIGENCE.md`
- **Per-system QA/edge cases before building or testing** → `docs/references/EDGE_CASES.md`
- **External learning material** (chunks, netcode, ECS perf…) → `docs/references/ARCHITECTURE_PATTERNS.md`;
  where to LEARN each (verified free books/talks/codebases per subsystem) → `docs/references/LEARNING_SOURCES.md`
- **Session-persistent context** also lives in Claude's auto-memory (loaded automatically); when the
  developer says "remember this", store it there — decisions belong in docs, preferences in memory.

## Claude Code workspace (`.claude/`)
- **Rules** (`.claude/rules/`) — path-scoped distillations of `docs/DESIGN_PATTERNS.md` (the PR rubric):
  ECS/hot-loop, content-is-data, TS style. The docs stay the authority; read them for anything structural.
- **Skills** — `/add-def` (content row or new family), `/add-system` (wire a system into the tick),
  `/check-canon` (diff vs the §12 checklist).
- **Agents** — `canon-reviewer` (diff review against the rubric), `silent-failure-hunter` (swallowed errors,
  defaults masking bad def data, EventBus dead letters).
- **Hooks** — `app/src` `.ts` edits are batch-typechecked at end of turn (project `tsc --noEmit` in `app/`);
  fix what it reports before finishing.
- **Context continuity** — conversation context is DISPOSABLE; files are the memory. Auto-compaction is a
  fallback, not the plan: at low context or session end, run **`/handoff`** (writes in-flight task state to
  `.claude/handoff.md`); prefer a developer-run `/compact <focus>` at a clean milestone over letting
  auto-compact fire mid-task. A PreCompact hook snapshots git ground truth automatically, and a SessionStart
  hook injects the resume pointer into fresh/compacted sessions. After ANY compaction: re-read files before
  editing them.

## Status
Runnable vertical slice: living sea + islands, hero movement, data-driven AI (profiles + FSM), the four-layer
GAS-lite combat (Gomu fruit end-to-end: pistol/gatling/rocket/stamp + stance toggle), factions + wildlife,
squads, ships, dialogue/interaction verbs, HUD/minimap. **Standards overhaul landed (2026-07):** fully strict
TS, seeded-Rng determinism + fixed timestep, Phaser-free sim (enforced by `app/test/architecture.test.ts`),
`docs/DESIGN_PATTERNS.md` is the coding canon.
**Next:** external-data content loading (ARCHITECTURE_SCALE §11 pillar #1); PlayerIntent/ControlSystem (the
multiplayer input keystone) when netcode work starts. Fuller sequencing: `docs/ROADMAP.md` — keep the two in
sync; if they disagree, ask the developer which is current.
