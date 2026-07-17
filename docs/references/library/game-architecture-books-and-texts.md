# Volume: Canonical Books & Free Texts

> Library volume · full research detail · trust levels: ✅✅ adversarially verified / ✅ fetched live (2026-07-02)

## 1. Game Programming Patterns — Robert Nystrom ✅✅ (3-0, 3-0)

- **What:** the foundational game-architecture patterns text; 20 chapters. The chapters map 1:1 onto
  openpiece: *Component* (ECS precursor), *Data Locality* + *Object Pool* (→ `core/Pool.ts`), *Game Loop* +
  *Update Method* (→ `SIM_DT` fixed-timestep accumulator), *Event Queue* (→ typed EventBus), *Spatial
  Partition* (→ collision/world queries), *Type Object* (→ Defs/Registries), *Dirty Flag*, *Service Locator*
  (the pattern openpiece deliberately rejects — see rimworld-simple `adoption-tiers.md` D#39).
- **Free & legal:** entire web edition at <https://gameprogrammingpatterns.com/> — author self-published:
  *"I had you in mind when I decided to put the entire contents of the book on the web for free."* The web
  version is the complete book, not a sample (print/ebook/PDF fund the author). Verified: all 20 chapters
  paywall-free; late-chapter spot-check returned full text.
- **Credibility:** *"I started writing this book while working at Electronic Arts. In my eight years
  there…"* — shipped-AAA background; also author of Crafting Interpreters.
- **Staleness note:** written 2009–2014 — it teaches the foundational *Component* pattern, **not** modern
  archetype ECS (flecs/bevy/bitecs). Order it *before* the ECS-specific material, not instead of it.
- **Openpiece mapping:** ECS/perf · content-as-data · sim loop. **Read first** — it's the shared vocabulary.

## 2. Game AI Pro, volumes 1–3 + Online Edition 2021 — ed. Steve Rabin ✅✅ (3-0, 3-0)

- **What:** the industry's practitioner-written AI chapter collection, ~150 chapters by shipped-game AI
  leads (Guerrilla, Bungie, Ubisoft, Monolith; chapters on Days Gone squad coordination, Mafia III
  open-world enemy AI, Horizon Zero Dawn, Warframe…).
- **Free & legal:** every chapter PDF at <http://www.gameaipro.com/> — *"All book chapters are free to
  download. Enjoy! -Steve Rabin, Series Editor"* with the explicit notice *"GameAIPro.com has permission
  from CRC Press to host this material"* (CRC retains copyright; only that site may host). A fourth,
  online-exclusive volume (Dec 2021) is also free, copyright retained by individual authors. Volumes
  published Sept 2013 / Apr 2015 / Jun 2017 / Dec 2021; vol 3 free since ~Sept 2019. PDFs spot-downloaded
  successfully.
- **Named chapters mapped to openpiece:** "The Behavior Tree Starter Kit" (§3 below) · "An Introduction to
  Utility Theory" (David Graham) · "Building Utility Decisions into Your Existing Behavior Tree" (Bill
  Merrill) · "Template Tricks for Data-Driven Behavior Trees" (Anthony Francis) · "JPS+: An Extreme A*
  Speed Optimization" (Rabin) · "Efficient, Event-Based Simulations" (Rez Graham) · influence maps, spatial
  reasoning, perception chapters.
- **Openpiece mapping:** the AI reference shelf for the FSM→BT/utility migration. Use as lookup, not
  cover-to-cover.

## 3. "The Behavior Tree Starter Kit" — Champandard & Dunstan (Game AI Pro ch. 6) ✅✅ (3-0, 3-0, 3-0)

- **What:** the canonical FSM→BT on-ramp. 19-page PDF that *"introduces the simplest piece of code that you
  can call a behavior tree, and builds it up incrementally"*: node types (sequences, selectors, conditions,
  actions, decorators/filters, §6.3.3–6.3.9), a fluent `BehaviorTreeBuilder`, the
  `onInitialize()/update()/onTerminate()` node contract, and **second-generation BTs** — event-driven
  traversal via a scheduler (no root-to-leaf polling every tick; SUSPENDED status for callback-driven
  leaves) + cache-friendly memory layout. The authors coined "first/second-generation BT" at Paris Shooter
  Symposium 2011.
- **DOD bonus:** concrete numbers — naive per-node heap allocation scatters nodes (cache misses); their
  packed composite layout is 32 bytes vs 64 pointer-based. The chapter doubles as a data-oriented lesson.
- **Companion code:** <https://github.com/aigamedev/btsk> — C++11, Zlib license, ~487 stars, dormant since
  2022 but live. *"Intended to serve as an example of a working BT for you to learn from… not a reusable
  middleware library."*
- **Lineage:** cites [Isla 05] "Handling Complexity in the Halo 2 AI" (GDC 2005 — the acknowledged BT origin
  talk; §6.4 calls Halo 2 "the original implementation") and Champandard's GDCE 2007 talk.
- **Openpiece mapping:** THE text for the `Brain` FSM→BT migration; pairs with the intent-split plan
  (rimworld-simple `adoption-tiers.md` S#2).

## 4. Data-Oriented Design — Richard Fabian ✅ (fetched, quoted)

- **What:** the book-length DOD treatment. Definition verified verbatim: *"data-oriented design is the
  practice of designing software by developing transformations for well-formed data where the criteria for
  well-formed is guided by the target hardware."* Chapters mapping to openpiece: *Existential Processing* +
  *Component Based Objects* (ECS), *Hierarchical Level of Detail* (world-sim LOD!), *Optimisations /
  Searching / Sorting*, *Relational Databases* (content-as-data — "tables not objects").
- **Free & legal:** <https://www.dataorienteddesign.com/dodbook/> — *"This is the free, online, reduced
  version. Some inessential chapters are excluded"*; paid print (ISBN 1916478700) funds it. Published
  2018-10-08.
- **Credibility:** shipped-AAA engine programmer; argues from *"real shipping games [that] have seen this
  object-centric approach commit crimes against the hardware."*
- **Key nuance for openpiece:** *"A common misconception about data-oriented design is that it's all about
  cache misses"* — it's a design methodology; applicable to a TS/browser game where data layout and
  transform-oriented systems matter more than CPU-cache micro-optimization.

## 5. Procedural Content Generation in Games — Shaker, Togelius & Nelson ✅ (search-verified only)

- **What:** the academically canonical procgen survey: search-based generation, grammars, cellular
  automata/noise terrain, answer-set programming, dungeon/level generation, evaluating generated content.
- **Free & legal:** author-version chapter PDFs at <https://www.pcgbook.com/> under their Springer
  agreement. Togelius is the field's most-cited researcher.
- **Openpiece mapping:** procgen (island/world generation) — the research-backed complement to Red Blob's
  tutorials. **Not yet adversarially verified** — from the search layer; verify before citing as canon.

## 6. Game Engine Architecture (3rd ed.) — Jason Gregory — ⚠ PAID (search-verified)

- Included to settle "which are legally free": this one is **not** — Routledge/Amazon only (the official
  site is companion material). Still the peer-recognized engine-systems survey; Gregory is a Naughty Dog
  lead (Uncharted/The Last of Us). If openpiece buys exactly one book, this is the candidate; everything
  else in this library is free.
