# Volume: Community Hubs, Wikis & Long-Running Blogs

> Library volume · full research detail · trust levels: ✅✅ adversarially verified / ✅ fetched live (2026-07-02)
> The "thousands of separated working systems" layer — where shipped devs document their systems topic by topic.

## 1. Red Blob Games — Amit Patel ✅ (fetched, quoted)

- **What:** *"interactive visual explanations of math and algorithms, using motivating examples from
  computer games"* — the most-cited pathfinding/procgen references in gamedev. Named tutorials mapping to
  ballpiece: **Introduction to A\*** · **Hexagonal grid reference** · map generation from noise ·
  **Polygonal Map Generation** (mapgen2/mapgen4 — islands with rivers and biomes) · Tower Defense
  (flow-field) pathfinding · 2D Visibility · Probability for RPG Damage.
- **Free:** *"All of my articles are available for free, with no signup and no ads."*
- **Credibility & longevity:** worked on **Realm of the Mad God** (commercial browser MMO — directly
  relevant to ballpiece.io); curating gamedev articles since 1990, site online since 1995, **still
  actively updated (most recent update 2026-02-28)**.
- **Ballpiece mapping:** procgen (island gen!) · AI pathfinding · combat math. First stop for any spatial
  algorithm.

## 2. Gaffer On Games — Glenn Fiedler ✅ (fetched, quoted)

- **What:** the practitioner netcode/sim-loop archive (copyright 2004–2024): "Fix Your Timestep!",
  "Floating Point Determinism", "Deterministic Lockstep", "Snapshot Interpolation", "State
  Synchronization", the Networked Physics series, UDP fundamentals, packet serialization.
- **Verified key content:**
  - *Fix Your Timestep!* prescribes exactly ballpiece's loop: fixed dt + accumulator + render interpolation
    (*"We can use this remainder value to get a blending factor between the previous and current physics
    state"*).
  - *Deterministic Lockstep* (2014-11-29): input-only networking — *"bandwidth is proportional to the size
    of the input, not the number of objects in the simulation"* — the reason lockstep tempts world-sim
    games.
  - **Load-bearing caveat for ballpiece MP:** *"Differences in floating point behavior between compilers,
    OS's and even instruction sets make it almost impossible to guarantee determinism for floating point
    calculations"* — pushes ballpiece toward server-authoritative state sync (or integer/fixed-point math)
    rather than cross-client float determinism. Note: JS engines are more uniform than C++ compilers, but
    the warning still applies across CPU architectures.
- **Credibility:** career netcode specialist; *"founder of Space Game LLC… making a 1000 player multiplayer
  space game"*; new writing continues at **mas-bandwidth.com** (index both). The homepage doesn't enumerate
  studio credits (e.g. Respawn/Titanfall) — verify those elsewhere before citing.
- **Ballpiece mapping:** netcode/multiplayer + the sim loop's canonical justification.

## 3. Grid Sage Games blog — Josh Ge (Kyzrati / Cogmind) ✅ (fetched, quoted)

- **What:** a decade of solo-dev, shipped-game systems writeups: map generation, AI, UI, data-driven
  content, dev process. Entry point: **"How to Make a Roguelike"** (2018) — free full-text version of his
  Roguelike Celebration talk, video embedded on the same page.
- **Credibility (at time of writing):** *"Seven years working exclusively with roguelikes; five as
  full-time developer; created Cogmind, POLYBOT-7, REXPaint, X@COM."*
- **The architectural advice verbatim:** *"The cool thing is you can build roguelikes piecemeal. They're
  basically a conglomeration of systems that can be tacked on"* — prototype a one-sentence core mechanic,
  release early and often. (Ballpiece's tracer-bullet roadmap, independently arrived at.)
- **Ballpiece mapping:** world-sim · procgen · solo-dev process. Subscribe.

## 4. RogueBasin — the Dev FAQ & article wiki ✅ (fetched, quoted)

- **What:** free community wiki (Dev FAQ v0.0.3, last edited 2021-06-22; content from the early-2000s
  rec.games.roguelike.development era). Systematically covers: dungeon representation & generation,
  persistent worlds, **big-world storage**, RNG, LoS/FOV, item & monster data, monster AI, battle systems.
- **Two verified gems directly relevant to ballpiece:**
  - **Def-vs-instance, 20 years ago:** *"items were split into 2 categories: properties unique to each
    item, and properties which are the same throughout the same item… This system works well for monsters
    too… Most monsters are stored in some kind of data (or text) file."* The Registry pattern, community
    edition.
  - **Sim-LOD, community edition:** *"dividing the world into 'active' and 'dormant' parts"* + catch-up
    simulation on return (*"process the monsters say 50 times"*) — the budget version of RimWorld
    world-pawns / Veloren rtsim.
- **Credibility & caveats:** named contributors include Kornel Kisielewicz (DRL/Jupiter Hell); unreviewed
  wiki, dated in places (raw-pointer serialization advice etc.) — read for patterns, not literal technique.
- **Ballpiece mapping:** procgen · world-sim · content-as-data archaeology.

## 5. /r/roguelikedev — FAQ Friday archive ✅ (fetched, quoted)

- **What:** the community wiki where working devs describe *their own shipped systems* developer-by-
  developer, topic-by-topic (60+ threads: saving, AI, map gen, time systems, world persistence).
  Verified live & free: <https://www.reddit.com/r/roguelikedev/wiki/faq_friday>.
- **Discovery index:** marukrap/RoguelikeDevResources (GitHub, ~1,284 stars) links FAQ Friday, RogueBasin's
  article index, Brogue level-gen deep dives, and codebases — **frozen since 2021-07**, spot-check links.
- Also: r/roguelikedev runs an annual summer code-along (~100 participants/year); the libtcod tutorial has
  shipped-game provenance (Ultima Ratio Regum and Temple of Torment both started as tutorial projects).
- **Ballpiece mapping:** this is the literal answer to "thousands of already-working systems, separated
  somewhere" — they're here, indexed by topic.

## 6. AI and Games — Dr. Tommy Thompson ✅ (fetched, quoted)

- **What:** case-study series dissecting AI in shipped games (F.E.A.R.'s GOAP, The Sims' utility, Halo's
  BTs, director systems), running since 2014: YouTube (250k+ audience, millions of views) + Substack
  (8k+ subscribers, free).
- **Credibility:** PhD in AI for games (2010); *"published over 50 peer-reviewed academic publications"*;
  full-time AI-for-games consultant since 2022 (AAA to indie). Endorsements: *"a classic on AI in/for
  games, not a hype wagon."*
- **Ballpiece mapping:** AI — the ongoing bridge between research and production. Subscribe.
