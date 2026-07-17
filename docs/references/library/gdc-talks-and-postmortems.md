# Volume: Must-Watch Talks & Postmortems

> Library volume · full research detail · trust levels: ✅✅ adversarially verified / ✅ fetched live (2026-07-02)

## 1. "'Overwatch' Gameplay Architecture and Netcode" — Timothy Ford, Blizzard, GDC 2017 ✅✅ (3-0 ×3)

- **What:** the shipped-AAA ECS talk *and* the server-authoritative determinism talk in one. Official
  description verified: *"'Overwatch' uses a cutting-edge Entity Component System (ECS) architecture…
  Blizzard's team leverages ECS to curtail complexity, even as they continue to add new crazy features"*
  and *"how this networked simulation works, and how it leverages determinism to achieve responsiveness and
  precision."* Scale facts: ~46 client systems, 103 component types, fixed 16 ms command frames.
- **Where (free):** GDC Vault free tier <https://www.gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and>
  ("free content" tag verified) + official GDC YouTube <https://www.youtube.com/watch?v=W3aieHjyNvw>.
- **Critical nuance (from verification):** Overwatch uses determinism for **client-side prediction under
  server authority — NOT lockstep**. That is exactly openpiece.io's model; watch this as the corrective to
  1500 Archers' P2P topology.
- **Openpiece mapping:** ECS/perf + netcode. The single most openpiece-shaped talk found.

## 2. Companion: "Networking Scripted Weapons and Abilities in 'Overwatch'" — Dan Reed, GDC ✅ (search layer)

- **What:** the lesser-known sequel: how Overwatch's **Statescript** ability system stays deterministic and
  predictable across client prediction and server authority. Free on the official GDC channel
  (<https://www.youtube.com/watch?v=odSBJ49rzDo>).
- **Why it matters more than it looks:** this is "GAS-lite abilities that survive netcode" — directly
  applicable when openpiece's ability engine meets the PlayerIntent/ControlSystem work. Not adversarially
  verified; confirm title/speaker before deep citation.

## 3. "1500 Archers on a 28.8" — Bettner & Terrano, Ensemble Studios, 2001 ✅✅ (3-0 ×3)

- **What:** the foundational deterministic command-stream postmortem (Age of Empires). Verified verbatim:
  - Same-sim, commands-only: *"run the exact same simulation on each machine, passing each an identical set
    of commands."*
  - Discrete ~200 ms communication turns, commands executed two turns later to hide latency.
  - Determinism = desync detection = anti-cheat: *"Any simulation that ran differently was tagged as 'out
    of sync' and the game stopped."*
  - The motivation was a bandwidth ceiling: naive per-unit state over 28.8k ≈ 250 units max vs thousands.
  - **RNG hygiene precedent:** random *cosmetic* terrain sounds had to save/re-seed the PRNG so
    presentation randomness never perturbed the sim — the exact sim/presentation RNG split openpiece's
    canon mandates (`DESIGN_PATTERNS` §8, seeded `core/Rng`).
- **Where (free):** <https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond>;
  PDF mirror at gamedevs.org. Assigned reading at Yale CS538/WPI; openage confirms AoE2 is still lockstep.
- **Caveat:** teaches **P2P lockstep** — openpiece is server-authoritative; the determinism discipline
  transfers, the topology does not (see #1).

## 4. "Three States and a Plan: The A.I. of F.E.A.R." — Jeff Orkin, GDC 2006 ✅✅ (3-0 ×3)

- **What:** the GOAP paper. Verified page-by-page:
  - p.1: *"The FSM for characters in F.E.A.R. has only three states, and we use A* to plan sequences of
    actions as well as to plan paths."* States: Goto, Animate, UseSmartObject.
  - pp.10–12: the planner is **STRIPS (1970) modified in exactly four ways** — per-action costs (A* over
    plans), fixed-size world-state arrays instead of Add/Delete lists, procedural preconditions, procedural
    effects. A concrete, replicable recipe (C++ Action class sketch included).
  - p.3, the solo-dev hook: *"we had only one A.I. programmer, but there are lots of A.I. characters"*;
    p.9: *"We never have to manually specify the transitions between these behaviors."*
  - **Content-as-data AI, shipped:** Goal Sets and Action Sets assigned per character in editors
    (WorldEdit/GDBEdit); flying drones were added late *"with a minimal amount of effort by combining goals
    and actions from characters we already had."*
  - **Squad honesty:** *"we actually did not have any complex squad behaviors at all"* — flanking/pincers
    *emerged* from four simple squad behaviors + individual planning + dialogue barks narrating decisions.
    Direct evidence for openpiece's emergence-over-scripting bet.
- **Where (free):** <https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf>; Vault session
  gdcvault.com/play/1013282; recording on archive.org (GDC2006Orkin). Peer-cited (WPI, Semantic Scholar).
- **Openpiece mapping:** AI — the step beyond BTs; read after the BT Starter Kit.

## 5. "Modeling Individual Personalities in The Sims 3" — Richard Evans, GDC 2010 ✅✅ (3-0 ×3)

- **What:** shipped utility AI + AAA content-as-data proof. Verified from the Vault page + slides:
  - Goal: *"make each Sim have her own individual personality which was clearly manifest in autonomous
    behavior"* — a utility system (modified Boltzmann selection over action utilities modulated by
    traits/motives).
  - *"Because the social system was fully data-driven, non-technical producers and designers were able to
    specify hundreds of interactions, and thousands of production-rules"* — slides show the designer-facing
    Excel authoring sheet; N≈300 social interactions per agent.
  - Includes live demos of the **in-game AI visualization/debug tools** — tooling guidance, not just theory
    (openpiece parallel: the Debug flag panel).
- **Where — IMPORTANT correction:** the GDC Vault *video* is **members-only paywalled** (fetch agent
  verified the members-only lock). Free routes: the official slide PDF
  (media.gdcvault.com/gdc10/slides/Evans_Richard_ModelingIndividualPersonalitiesInTheSims3.pdf) and the
  YouTube mirror (<https://www.youtube.com/watch?v=DVMs5_B611E>). Wikipedia's "Utility system" article cites
  this talk as the named example.
- **On-ramp first:** GMTK's "The Genius AI Behind The Sims" (gmtk.substack.com) — credible free explainer of
  the smart-object/motive model; read before the primary sources. ✅ (search layer)

## 6. Provenance anchors: Halo 2 BTs & Dwarf Fortress talks ✅ (fetched, quoted)

- **"Handling Complexity in the Halo 2 AI"** — Damian Isla, GDC 2005: the acknowledged BT origin talk;
  verified as provenance via the BTSK chapter's references (written proceedings on gamedeveloper.com; audio
  on archive.org per verifiers; **video availability unconfirmed**).
- **Tarn Adams (Dwarf Fortress)** — from the DF wiki's curated interview index (~80 entries, 2008–2025,
  last edited 2026-05):
  - "Practices in Procedural Generation" (GDC 2016, gdcvault.com/play/1023372) — free on Vault
  - "PCG Shotgun: 6 Techniques for Leveraging AI in Content Generation" (GDC 2017, gdcvault.com/play/1024146)
  - "Long-term Simulation Design in Dwarf Fortress" (YouTube, 2016) · "Emergent Narrative in Dwarf
    Fortress" (2017) · "Villains in Dwarf Fortress" (Roguelike Celebration 2018)
  - Stack Overflow blog: "700,000 lines of code, 20 years, and one developer" (2021) — solo-dev
    architecture sustainability, rare and directly relevant.
- **Openpiece mapping:** world-sim/procgen — the living-world north-star's design record.
