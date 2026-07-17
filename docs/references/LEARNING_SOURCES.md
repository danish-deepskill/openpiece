# Openpiece — Verified Learning-Source Map

> **The problem this solves:** thousands of proven, professional game-systems resources exist — but scattered.
> This is the curated map: for each openpiece subsystem, *start here, in this order*. **Full research detail**
> (per-source credibility evidence, verbatim quotes, dates, staleness warnings, dead-link corrections) lives
> in the library volumes: `library/README.md`. Companion docs: `ARCHITECTURE_PATTERNS.md` (the concepts by
> theme — this doc is where to *learn* them), `rimworld-simple/` (the RimWorld deep-dive),
> `../design/REFERENCES.md` (game *ideas* tier list).
>
> **Provenance & trust levels:** built 2026-07-02 by a 105-agent deep-research pass (5 search angles →
> 23 sources fetched → 115 claims extracted → top 25 adversarially verified, 25/25 confirmed 3-0).
> - ✅✅ = **adversarially verified** (3 independent refutation votes, all survived; links checked live)
> - ✅ = **fetched & quoted live** the same day (single-agent verification, no adversarial pass)
> - Everything listed is **free** (legally — publisher-sanctioned where applicable) unless marked.

---

## The path (what a senior would hand a junior, in order)

1. **Game Programming Patterns** — architecture vocabulary (skim; openpiece already implements most)
2. **Mike Acton, "Data-Oriented Design and C++"** — the data-oriented mindset
3. **Tim Ford, "Overwatch Gameplay Architecture and Netcode"** — shipped ECS + server-authoritative determinism
4. The **AI chain**: Behavior Tree Starter Kit chapter → Orkin's F.E.A.R. paper → Evans' Sims 3 talk → Game AI Pro as reference shelf
5. **"1500 Archers on a 28.8"** — determinism-as-discipline (the *why* behind DESIGN_PATTERNS §8)
6. **Veloren** — the codebase to read alongside building (the "RimWorld decomp" of open source)
7. Subscribe: **Factorio FFF** + **AI and Games** + **Grid Sage blog** for the long game

---

## By subsystem

### ECS / performance
- ✅✅ **Game Programming Patterns** (Robert Nystrom, ex-EA) — entire book free at gameprogrammingpatterns.com.
  The chapters map 1:1 onto openpiece: Component, Data Locality + Object Pool (`core/Pool.ts`), Game Loop
  (`SIM_DT` accumulator), Event Queue (`EventBus`), Spatial Partition, **Type Object (= Defs/Registries)**.
- ✅✅ **"Data-Oriented Design and C++"** — Mike Acton, CppCon 2014, free on CppCon's YouTube. The philosophy
  under every cache-friendly ECS; Acton was Insomniac's engine director and later architected Unity DOTS —
  i.e. the "DOTS course" you were looking for, from the source, free.
- ✅ **Data-Oriented Design** (Richard Fabian) — legally free *reduced* web edition at
  dataorienteddesign.com/dodbook (some chapters print-only). The book-length version of Acton's talk.
- ✅ **"A Practical Guide to Applying Data-Oriented Design"** (Andrew Kelley, Handmade Seattle 2021, free) —
  positioned as the practical successor to Acton's talk, by the Zig language creator.
- ✅ **skypjack on software** (Michele Caini, EnTT creator) + **"Building an ECS"** series (Sander Mertens,
  flecs creator, on Medium) — first-party ECS-internals blogs: sparse sets vs archetypes, hierarchies,
  prefabs. Read when `ecs/World.ts` needs its next performance step.

### AI (Brain → BT → planner → utility)
- ✅✅ **Game AI Pro, vols 1–3 + 2021 online edition** — every chapter PDF free at gameaipro.com, explicitly
  publisher-sanctioned (CRC notice on-site). The industry's practitioner-written AI shelf.
- ✅✅ **"The Behavior Tree Starter Kit"** (Game AI Pro ch. 6, Champandard & Dunstan) — the FSM→BT on-ramp:
  builds a minimal BT incrementally; companion repo github.com/aigamedev/btsk (Zlib, study code by design).
  THE reference for the planned `Brain` FSM→BT migration. Cites Isla's Halo 2 GDC 2005 talk (BT origin).
- ✅✅ **"Three States and a Plan: The A.I. of F.E.A.R."** (Jeff Orkin, GDC 2006, free PDF at gamedevs.org) —
  3-state FSM + A*-as-planner (STRIPS with four documented modifications). Solo-dev-relevant on purpose:
  one AI programmer, many characters, zero hand-authored transitions. The step *beyond* BTs.
- ✅✅ **"Modeling Individual Personalities in The Sims 3"** (Richard Evans, GDC 2010) — shipped utility AI
  **and** AAA-scale content-as-data proof: hundreds of interactions authored by non-programmers in data.
  Validates both the utility-AI ambition and the registry canon. **Note:** the GDC Vault *video* is
  members-only — free routes are the official slide PDF and the YouTube mirror (see library volume).
- ✅ **AI and Games** (Dr. Tommy Thompson — PhD, 50+ peer-reviewed publications) — the ongoing case-study
  channel/site for how shipped games do AI. Subscription material.

### Determinism & multiplayer (openpiece.io)
- ✅✅ **"1500 Archers on a 28.8"** (Bettner & Terrano, Ensemble, 2001, free at gamedeveloper.com) — the
  foundational deterministic command-stream postmortem: same sim everywhere, transmit only commands,
  checksums double as desync detection + anti-cheat. **Caveat:** it teaches P2P *lockstep*; openpiece is
  server-authoritative — the determinism discipline transfers, the topology does not.
- ✅✅ **"Overwatch Gameplay Architecture and Netcode"** (Tim Ford, GDC 2017; Vault free tier + official GDC
  YouTube) — the corrective to the caveat above: server authority + client prediction *leveraging*
  determinism, in a shipped ECS (~46 systems / 103 component types / fixed 16ms frames). The single most
  openpiece-shaped talk in existence.
- ✅ **Gaffer On Games — "Fix Your Timestep!"** (Glenn Fiedler) — the canonical article for the exact
  accumulator + interpolation loop openpiece already runs; read to know *why* it's right. The rest of the
  site (snapshot interpolation, networked physics series) is the next netcode reading — not yet
  adversarially verified, see gaps.

### Content-as-data / modding
- ✅✅ **Nystrom's Type Object chapter** + ✅✅ **Evans' Sims 3 talk** (above) — the pattern and its AAA proof.
- ✅ **Factorio Friday Facts** — weekly shipped-engine dev blog, unbroken since 2013 (200+ consecutive by
  FFF #200): determinism war stories, optimization deep dives, modding architecture. The best "study a
  shipped sim like a decompile" archive that isn't a decompile.

### Living-world simulation & codebases-to-read
- ✅✅ **Veloren** (gitlab.com/veloren/veloren, GPL-3, active through 2026) — multiplayer voxel RPG in Rust,
  DF-inspired, with its own architecture book (book.veloren.net: ECS chapter is substantive; worldgen
  chapter is a WIP stub — the 2-1 vote caveat). Its **rtsim** (persistent NPC lives in unloaded chunks,
  profession-based economy) is working code for exactly openpiece's sim-LOD problem.
- ✅ **Dwarf Fortress wiki's developer-interview index** — ~80 curated Tarn Adams interviews/talks
  (2008–2025), the one-stop archive on the deep-sim north star.
- ✅ **DESOSA Cataclysm: DDA chapter** (TU Delft) — academic architecture analysis of the open-source deep
  survival sim; a guided tour before reading its source.

### Procgen / worldgen / roguelike systems
- ✅ **Red Blob Games** (Amit Patel) — free, no ads, interactive: A*/flow fields, hex & grid math, polygon
  map generation (mapgen2/mapgen4 — directly island-shaped). The first stop for any spatial algorithm.
- ✅ **Grid Sage Games blog — "How to Make a Roguelike"** (Josh Ge / Cogmind) + the whole blog — a decade of
  shipped-game systems writeups (map gen, AI, FOV, UI).
- ✅ **RogueBasin Dev FAQ** + **/r/roguelikedev FAQ Friday archive** (reddit.com/r/roguelikedev/wiki/faq_friday)
  — the community wikis where dozens of devs each document how *their* shipped system works, topic by topic
  (map gen, save systems, AI, time systems). The "thousands of separated working systems" you suspected
  exist — this is where a lot of them live.

### Structured long-form
- ✅ **Handmade Hero** (Casey Muratori) — 667 free episodes building a game engine from scratch on stream;
  the deepest structured series on sim/engine fundamentals. Use as a lookup course (episode guide at
  guide.handmadehero.org), not a watch-through.

---

## Known gaps (next research pass, from the workflow's open questions)

Unverified categories — candidates exist but didn't get the adversarial pass:
1. **Procgen verification round**: WFC (mxgmn), noise-based island gen, Veloren worldgen dev blogs.
2. **Server-authoritative netcode chain**: Gaffer's snapshot-interpolation series, Gabriel Gambetta's
   client-prediction articles, .io postmortems — needed to complement the lockstep-era material.
3. **Economy/skills**: OSRS Grand Exchange design material, EVE economist reports, Tynan Sylvester's
   *Designing Games* — nothing verified yet for the OSRS-pillar.
4. **Sim-LOD talks**: no named GDC talk survived; RimWorld/Veloren rtsim remain the working references.

## Maintenance

Links verified live 2026-07-02. GDC Vault free-tier policy can change (both Vault talks are mirrored on the
official GDC YouTube channel); the BTSK repo is dormant (last push 2022) but live. When adding a source here,
state what it teaches, who shipped what, whether it's free, and which subsystem it maps to — and mark it ✅
until it survives an adversarial pass.
