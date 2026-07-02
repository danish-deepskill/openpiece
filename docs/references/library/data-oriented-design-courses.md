# Volume: Data-Oriented Design & Structured Courses

> Library volume · full research detail · trust levels: ✅✅ adversarially verified / ✅ fetched live (2026-07-02)
> This is the "DOTS course" lineage the developer asked about — traced to its sources, all free.

## 1. "Data-Oriented Design and C++" — Mike Acton, CppCon 2014 ✅✅ (3-0 ×3)

- **What:** the canonical DOD lecture. Abstract verified verbatim: *"The transformation of data is the only
  purpose of any program. Common approaches in C++ which are antithetical to this goal will be presented in
  the context of a performance-critical domain (console game development)."*
- **Credibility (maximal for this topic):** contemporaneous bio — *"Mike Acton is Engine Director at
  Insomniac Games"* (Ratchet & Clank / Resistance / Sunset Overdrive); Unity's Nov 2017 announcement
  confirms he then joined Unity to *"democratize data-oriented programming"* → VP of DOTS. **The talk's
  author architected DOTS itself** — this IS the primary source behind every DOTS course.
- **Where (free):** official CppCon YouTube <https://www.youtube.com/watch?v=rX0ItVEVjHc> (public, oEmbed
  verified); full slide deck free in the CppCon/CppCon2014 GitHub repo; announced on isocpp.org 2015-01-28
  (institutional provenance). Delivered 2014-09-11.
- **Nuance from verification:** Acton teaches **DOD, not ECS per se** — the philosophy underlying ECS/DOTS.
- **Ballpiece mapping:** ECS/perf mindset — SoA thinking, typed arrays, avoiding per-entity object churn in
  TS hot loops. Watch after Nystrom's Data Locality chapter.

## 2. Data-Oriented Design (the book) — Richard Fabian ✅ (fetched, quoted)

- Full entry in [game-architecture-books-and-texts.md](game-architecture-books-and-texts.md) §4. Course
  role: the structured self-paced text between Acton (mindset) and Kelley (practice). Free reduced web
  edition, legally (author-hosted).

## 3. "A Practical Guide to Applying Data-Oriented Design" — Andrew Kelley, Handmade Seattle 2021 ✅ (fetched)

- **What:** *"Andrew Kelley, creator of Zig, picks up where Mike Acton left off to teach us practical ways
  to apply data-oriented design"* (conference blurb verbatim). Concrete refactoring mechanics: struct
  layout, data-type sizing, memory alignment, **encoding state in indices/enums instead of pointers**,
  measuring memory-per-entity reductions. The index-handles-over-references approach maps 1:1 onto a
  TypeScript ECS with numeric entity ids.
- **License:** published CC BY-NC-ND 4.0, hosted donation-supported — genuinely free.
- **⚠ LINK CORRECTION (verified 2026-07-02):** the original media.handmade-seattle.com URL is **dead**
  (DNS gone). Working routes: official Vimeo <https://vimeo.com/649009599>, YouTube mirror
  <https://www.youtube.com/watch?v=IroPQ150F6c>, Wayback snapshot of the page (2022-12-20). Published
  2021-11-23.
- **Ballpiece mapping:** ECS/perf — the most actionable modern DOD talk for a solo dev.

## 4. Handmade Hero — Casey Muratori ✅ (fetched, quoted)

- **What:** **667 numbered day-episodes** (final: "Day 667: Simplified Tile Occupancy Checking") of a
  professional (RAD Game Tools / Granny 3D) building a complete game from scratch in C, every line
  explained. One of the longest structured game-programming courses in existence; free.
- **Named episodes mapping to ballpiece:**
  - *Day 063 "Simulation Regions"* + *Day 064 "Mapping Entity Indexes to Pointers"* + *Day 277 "The Sparse
    Entity System"* — entity storage + **world partitioning for sim-LOD**
  - *Day 115–116* SIMD basics/conversion · *Day 122* multithreading intro · *Day 350 "Multithreaded World
    Simulation"* — data-oriented perf, engine-agnostic
  - *Day 305 / 341* — memory arenas (allocation strategy behind pooling)
- **How to use:** as a **searchable reference** (guide.handmadehero.org indexes every episode), not a
  linear watch. Supplementary series (Intro to C, Handmade Chat, HandmadeCon talks) also indexed.
- **Ballpiece mapping:** sim loop · entity storage · world-sim LOD · perf.

## 5. Unity Learn — "DOTS Best Practices" (official) ✅ (search layer)

- **What:** the reputable version of the "Unity DOTS course" category: Unity's own free structured course on
  DOD fundamentals, chunk/archetype memory layout, and job scheduling, plus the free 50+ page "Introduction
  to DOTS" e-book. <https://learn.unity.com/course/dots-best-practices>
- **How to read for ballpiece:** Unity-specific APIs, but the archetype/chunk iteration model is exactly
  what a TS ECS imitates — *read for the why, not the C# how*. Not adversarially verified.

## 6. Catlike Coding — Jasper Flick ✅ (search layer)

- **What:** the long-running free Unity tutorial archive widely regarded as the gold standard of structured
  teaching; the Basics/Hashing/Jobs series walks from naive OO code to Burst-compiled data-oriented jobs
  **with measured frame times at every step**. <https://catlikecoding.com/unity/tutorials/>
- **Why it's here despite being Unity:** the *optimization methodology* — measure, restructure data,
  re-measure — transfers to Phaser/TypeScript even though the API does not. Not adversarially verified.

## Reading order for this volume

Nystrom's Data Locality chapter → Acton (mindset) → Fabian's book (theory, as-needed chapters) → Kelley
(practice) → Handmade Hero + FFF perf posts as lookup references. Unity DOTS course + Catlike only if you
want the archetype/chunk model spelled out slowly.
