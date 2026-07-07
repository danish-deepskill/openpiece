# Big 3 Crossover — Design Summary

> A continuation of **Ballpiece**: extending the living, deeply-simulated One Piece sea into a
> three-verse universe of **pirates, ninjas, and soul reapers** (One Piece × Naruto × Bleach).
> This captures the conclusions from the design conversation — the *why* behind each decision.

---

## 1. The Concept

A single unified universe combining the three power systems of the "Big 3":

- **Pirates** (One Piece) — the base world layer: one continuous ocean of islands.
- **Ninjas** (Naruto) — shinobi nations slotted into specific seas.
- **Soul Reapers** (Bleach) — a separate plane of soul realms reached through gates.

Proposed geography: One Piece's ocean as the base spine, with the ninja nations placed in the Blues
(e.g. Earth in North Blue, Wind in West Blue, Lightning in East Blue), and the soul realms
(Soul Society / Hueco Mundo / Hell) as distinct zones.

---

## 2. Why It Fits the Ballpiece Foundation

The crossover lands cleanly because the existing architecture is **verse-agnostic**:

- **The Moat (control-as-component)** doesn't care what body it drives — possess-any-unit works
  identically on a pirate, a ninja, or a soul reaper.
- **Content = Registries.** Three power systems are just more ability Defs on the one uniform stack.
  The doc already files deep *content* under "solved structurally — not the hard part."
- **Faction matrix** already does Marines-vs-pirates; villages and Gotei-vs-Hollows are extra rows,
  and cross-verse politics (do Marines ally with Soul Reapers?) becomes free emergent content.
- **F→Yonko tier + bounty ladder** is the natural home for the power scaling.
- **Zoneable / sharded world** absorbs the soul realms as separate zones reached via gates
  (invisible handoff or deliberate portal).

**Key discipline:** the crossover is **content, not foundation**. Because it fits *so* cleanly, the
temptation is to build it early. Don't. It belongs at **step 6 ("widen")** — after the One Piece
slice proves the Moat through steps 1–5. Build One Piece first to prove the architecture; add ninjas
and soul reapers as registries once the spine holds. One Piece proves it *works*; the other two prove
it *generalizes*.

---

## 3. Why One Piece Is the Base Layer

Of the three, One Piece is the only world **already built to contain other worlds** — a connected
ocean of islands, each running its own rules. Naruto (bordered continent) and Bleach (dimensional
stack) are both *closed* geographies. So nesting the others inside One Piece is the only nesting the
source material supports.

**Geography quirk to exploit, not hide:** in canon, the four Blues are separated by the Red Line and
Grand Line — so ninja nations placed in different Blues are *harder* to reach from each other than in
canon Naruto. Lean into this: a shinobi world fractured across the seas gives the two systems a
built-in reason to *need* each other (sea travel, or ninja space-time techniques).

---

## 4. Power Systems — "Shared Chassis, Divergent Signatures"

The central worry was: *will the three feel the same?* The honest diagnosis:

- The three share a **grammar** (energy stat → spend-to-use abilities → transformation ladder →
  willpower tiebreaker). Implemented naively, they collapse into three reskinned mana bars.
- **But that shared grammar is a feature, not a bug.** Three fighters can only interact *fairly* —
  and stay deterministic across the netcode — if they run on a common base. The overlap is what makes
  the crossover *possible*.

**The principle:** give all three the **same skeleton**, then give each **one signature mechanic**
nobody else has. Each signature falls out of the verse's underlying philosophy:

| Verse | Signature mechanic | Philosophy | Role archetype |
|---|---|---|---|
| **Ninja** | Learnable toolkit + elemental matchup; clone/substitution trickery | Control | Versatile combo-caster |
| **Pirate** | Haki as universal counter-layer + one world-unique fruit gimmick on a tank body | Variety | Durable bruiser |
| **Soul Reaper** | Reiatsu pressure-field (zone debuff) + shikai→bankai release snowball | Hax / escalation | Scaling zone-controller |

**Redundancy smell-test:** describe each verse's combat loop in one sentence — if two come out the
same, you have overlap.
- Ninja: *"read the matchup and pick the right tool from my kit."*
- Pirate: *"tank the hit, win the Haki read, land my one big gimmick."*
- Soul Reaper: *"survive early, build to release, then snowball and control space."*

Three different sentences → no redundancy. The risk is **flattening in code** (building only the
shared chassis), which is a discipline problem, not a fit problem.

---

## 5. Power Scaling — Bottom / Mid / Top

Chosen ordering (matches the raw-ceiling consensus): **One Piece bottom · Naruto mid · Bleach top.**
Two traps and one opportunity:

- **Trap 1 — "average" erases One Piece's identity.** One Piece is *lowest* on output/burst but
  *highest* on durability/physicals. Split the tier stat into **two axes**: pirates = low burst,
  high HP. Otherwise LOD resolution will delete pirate squads that should win by attrition.
- **Trap 2 — Bleach top + hax = oppressive.** If Bleach is highest tier *and* rule-breaking, that's a
  double-whammy. Pick one per faction: **cage the hax into stat mechanics** (see §6).
- **Opportunity — the gap is a ladder.** Bottom→mid→top maps onto a difficulty curve: start in the
  Blue seas (pirate tier) → grow into shinobi lands (ninja tier) → endgame in the soul realm (Bleach
  tier). With "one energy, three traditions," proximity-to-source becomes the diegetic reason for the
  tiering — and the soul realm becomes the *source layer*, not a side area.

**The deciding fork:** is the player meant to **climb** from pirate-tier to soul-reaper-tier (RPG /
progression → vertical gaps are good, ordering is the backbone) — or **pick one faction and stay**
(PvP / shared level band → need *lateral* balance via asymmetry, e.g. Haki as the pirate's
anti-hax giant-killer)?

---

## 6. Hax vs. Netcode — a Hard Constraint

"Cage the Bleach hax" is not just a balance nicety — it's a **technical requirement** of a
server-authoritative stack with client-side prediction and lag compensation:

- Stat-based abilities (bounded dodge-buff, real cooldowns, actual hitboxes) **predict, reconcile,
  and stay deterministic.**
- Reality-warpers ("I edited the future," total perception-hypnosis) **desync.**

So the architecture *itself* votes for down-converting Bleach's signature powers into bounded stat
mechanics. **Keep the flavor, cage the mechanic.** (Import Bleach's aesthetics and soul-realm
cosmology freely; stat-ify its rule-breaking abilities.)

---

## 7. Uniqueness Verdict (which system is most distinctive)

- **Naruto = the baseline.** Chakra/elements/hand-seals is the most *refined* but least *strange* —
  the reference point the other two define themselves against. Least unique.
- **Bleach = most unique premise.** "Your power *is* your soul, externalized as a named sentient
  weapon unique to you" is the most novel *idea* — rare across all of fiction. Most unique as
  *mythology*.
- **One Piece = most unique mechanics.** Two structural rarities: (1) **two independent power systems
  in parallel** (Devil Fruits + Haki), and (2) **world-scarcity** — exactly one of each fruit power in
  the world; eating it removes it until death. Plus the permanent swimming cost. Most unique as a
  *machine*.

**For a game, mechanical uniqueness wins** — and One Piece's world-scarcity is *tailor-made for the
simulation* (a Devil Fruit someone eats is gone from the world until they die = a live, trackable,
contestable **economy of finite powers** the persistent world can remember). Chakra and reiatsu are
personal, infinite, non-scarce — they don't give you that.

**Design lever:** make each verse unique in a *different direction* rather than forcing sameness —
pirates = scarce-economy system, soul reapers = soul-bound bespoke system, ninjas = learnable-toolkit
system. "How unique, and in what direction" becomes part of what distinguishes the factions.

---

## 8. Naming (candidates)

The name must evoke the *fusion* of three worlds, stay "serial-numbers-filed" for IP safety, and fit a
`.io`. Grouped by angle:

- **Three-in-one:** *Trident* (three prongs + nautical + combat; common word, hard to own), *Triverse*
  (clear but on-the-nose), *Trinity* (overused).
- **Unifying source:** *Conflux* (three currents merging — most thematically accurate, ownable),
  *Maelstrom* (dramatic, oceanic; common), *Anima* (soul/life-force; least "pirate").
- **Moat angle:** *Vessel* — a triple pun: a **ship** (pirate), a **body you inhabit** (the
  possess-any-unit control component), and a **container for a soul** (soul reaper). The only name that
  encodes the possession mechanic.

**Lead picks:** **Vessel** (the *design* choice — means something specific about *this* game, ages
well) vs. **Trident** (the *marketing* choice — sells itself in one glance). Tension: evocative single
words are memorable but hard to *own*; invented-ish names (Conflux, Triverse) are ownable but must
*earn* their meaning.

**Naming depends on:** does the new name **replace** Ballpiece as the umbrella (→ go verse-neutral,
Vessel/Conflux) or does **Ballpiece stay** as the pirate slice with the crossover as a grander name
above it?

---

## 9. Risks to Bank Now

1. **Hax vs. netcode** (§6) — stat-ify Bleach's rule-breakers before building.
2. **Two-axis tier stat** (§5) — bake low-burst/high-durability in early so LOD resolution respects
   attrition builds.
3. **IP reality** (*flag, not legal advice*) — a public, monetized, always-on `.io` combining three
   named franchises invites three rights-holders; fan games get C&D'd exactly when they get popular and
   monetize. Cheapest safe path: keep the three as **archetypes** (seafarers / shadow-arts villages /
   death-priesthood) with original names and not-quite-Devil-Fruits. The architecture cares about
   mechanics, not names.
4. **Scope discipline** (§2) — crossover is a "widen" step, not a foundation decision.

---

## 10. Open Questions (decide these to lock direction)

1. **Climb or pick-one?** Progression RPG (vertical gaps = backbone) vs. faction-select PvP (needs
   lateral balance). *This single choice reshapes the scaling philosophy and the hax problem.*
2. **Hybrid or siloed characters?** Can one unit mix traditions (a pirate who learns jutsu)? Siloed →
   signatures alone keep them distinct (safe). Hybrid → signatures must *combine* interestingly, not
   stack into soup (richer, riskier).
3. **Is the crossover the true end-goal**, or one "widen" option among several? If end-goal, bake the
   "one energy, three traditions" resource model + two-axis tier component into the foundation *now*
   (cheap; it's the §10 "pick the deep axes early" discipline). If optional, keep the foundation pure
   One Piece and don't pay the tax yet.
4. **Umbrella name or sub-name?** Decides whether the game name goes verse-neutral or stays
   pirate-leaning (see §8).

---

### One-line summary

A three-verse (**pirate / ninja / soul reaper**) living-world game on the Ballpiece foundation —
where the crossover fits because the Moat is verse-agnostic and powers are just registries; where the
three stay distinct via **shared chassis, divergent signatures**; scaled **pirate-bottom / ninja-mid /
soul-reaper-top** with a durability split and caged hax; and where **One Piece's world-scarcity** is
the mechanically-unique feature that most rewards the simulation.