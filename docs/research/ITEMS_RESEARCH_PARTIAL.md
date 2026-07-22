# Items & Inventory — research evidence (#21)

> Evidence file for the #21 design pass (`docs/design/ITEMS.md` consumes and cites this). Gathered
> 2026-07-18. **Salvaged run:** the deep-research workflow was killed mid-pipeline by the developer
> (context budget) after scope + all 5 searches + 6 claim-extraction agents completed; the adversarial
> verification phase never ran. Labels are downgraded honestly per the salvage protocol: **[VERIFIED]**
> only for claims read directly from a primary source by this session (the local RimWorld decompilation),
> **[SOURCED]** for journal claims whose extraction agent read the source but whose 3-vote gauntlet was
> cut, **[LORE]** for assistant-knowledge or wiki-labeled-rumor. No decision below rests on a [LORE] claim.

## The question

The commons tier (ItemRef `{cat, id}` over typed registries, no counts, no per-item state) is built.
What does shipped precedent say about: the commons/instance boundary, the quantity model, containers,
ownership/theft, and degradation — and what are the failure stories?

## Findings by angle

### 1. The dupe-bug class (OSRS + MU Online) — the angle that completed fully

- **[SOURCED]** The entire item-duplication class reduces to ONE root cause: **non-atomic,
  timing-dependent persistence/transfer of item state** — dupes are transaction races, not random bugs
  (munique.net, OpenMU author's post-mortem of MU Online's dupe history).
- **[SOURCED]** Canonical mechanisms: (a) container-transaction rollback (cancelling a trade restored a
  pre-trade inventory snapshot, doubling anything an NPC transaction consumed mid-trade); (b)
  save-ordering races (two connections, stale save overwrites newer — traded items persist on both
  sides); (c) OSRS 2019: trade → second account logs out (committing its save WITH the items) →
  attacker-induced server crash inside the ~15-minute autosave window → giver reverts to pre-trade save.
  The crash was *player-controllable* (mass-loading worlds). (osrs wiki, Server crash glitch.)
- **[SOURCED]** The 2003 partyhat dupe was a **client-trust failure**: a modified client injected a raw
  item id into an in-progress trade and the server accepted client-supplied trade contents without
  validating against one authoritative container state. Economy took ~11 months to restabilize; Jagex
  refused a rollback.
- **[SOURCED]** Pure id+quantity items carry **no provenance**: 2019 remediation was manual,
  account-by-account gold removal, because duplicated wealth cannot be traced through the item itself.
- **Design consequences adopted:** all item mutations flow through ONE service with single-tick atomic
  transfers; no client-supplied item payloads ever (server validates against authoritative container
  state); valuable items get instance identity precisely BECAUSE it makes existence structurally unique
  and history traceable.

### 2. OSRS's pure id+quantity model — the fungible extreme

- **[SOURCED]** Stack quantity is a signed 32-bit int; the engine's overflow rule is **clamp/refuse
  ("out of space"), never wrap** — the correctness condition for any id+quantity substrate.
- **[SOURCED]** Per-item state breaks the model: charged/degradable items are encoded as **families of
  separate item ids** (each charge level its own id) and only stack when identical — the workaround we
  refuse (combinatorial id explosion, state laundered into identity).
- **[SOURCED]** Stack caps are **per-item data**, not one global constant (item- and container-specific
  limits throughout) → `stackLimit` belongs on the def.
- **[SOURCED]** Stackability is a **context property** (bank stacks everything as (id, n); inventory
  stacks only stackables) — containers may impose their own aggregation rules.
- **[SOURCED]** Placeholders/notes exist to patch fungibility gaps (zero-count slot reservations;
  stackable "notes" standing for non-stackables) — UI-era conveniences, not substrate requirements.

### 3. RimWorld Thing/ThingDef — the canonical hybrid (verified against local decomp)

- **[VERIFIED]** Every spawned Thing is technically an instance carrying `stackCount` (default 1);
  fungibility is expressed as `def.stackLimit > 1`. Spawning over the limit **clamps and logs an
  error** ("Truncating") — fail-loud clamp, exactly our canon. (`Verse/Thing.cs:27,825-828`.)
- **[VERIFIED]** `CanStackWith(other)`: same def required, **and relics NEVER stack** (`IsRelic()`
  check) — RimWorld names our tracked-unique rule literally. (`Verse/Thing.cs:1553+`.)
- **[VERIFIED]** Quality is an **optional comp** (`CompQuality : ThingComp`) — per-instance state as
  opt-in composition on the instance, not a field on every item. `MinifiedThing : IThingHolder` is an
  item that CONTAINS another thing — containment as a uniform holder interface.
- **[LORE]** Deterioration: exposed/outdoor items lose hit points at a def-driven `deteriorationRate`
  (wiki-documented; decomp hook not re-read this session). Used only as inspiration for litter decay.

### 4. Ownership & theft (Skyrim / Kenshi / RimWorld) — search lists only; fetch died

- **[LORE]** Skyrim: per-item stolen flag, launderable via fences and certain container/follower
  transfers (documented exploit class: flag laundering); fences are the only buyers of flagged goods.
- **[LORE]** Kenshi: theft is a witnessed ACT (detection at the moment of taking, faction relations hit);
  goods themselves mostly unmarked.
- **Design consequence adopted (stands on the [SOURCED] no-provenance finding + canon #6, not on the
  [LORE] details):** the crime lives on the ACT for commons (witnessed event → heat, goods untraceable
  — which is honest fungibility and feeds the underworld), and on the THING for instances (a stolen
  named blade is evidence forever). Per-item stolen flags on commons are rejected — the Skyrim
  laundering exploit class plus fungibility contradiction.

### 5. EVE / X4 everything-is-an-instance; Minecraft components — search lists only; fetch died

- **[LORE]** EVE: every item a database row in a location tree; decades of documented DB-scale cost;
  mitigations shipped (stack merging, asset safety). X4's save bloat already recorded in backlog #7.
- **[LORE]** Minecraft 1.20.5 replaced raw NBT with `id + count + optional structured components`;
  stacks merge only when components are equal. The modern id+state hybrid, converging on the same shape
  as RimWorld's optional comps.
- **Design consequence:** instance-by-exception, never instance-by-default. Both [LORE] angles are
  corroborative only — the decision stands on canon (ids-at-rest, allocation discipline) and the
  [VERIFIED] RimWorld shape.

## Verdict table (adoption-tiers pattern)

| Finding | Tier | Verdict |
|---|---|---|
| One atomic item-mutation service; single-tick transfers | **S** | Adopt now — the structural dupe defense; also where clamps live |
| `stackLimit` as per-def data; overflow = clamp + loud log | **S** | Adopt now (OSRS + RimWorld agree) |
| Instance-by-exception (state ⇒ instance), commons-by-default | **S** | Adopt now — RimWorld/Minecraft convergent shape, canon-native |
| Relics (tracked uniques) never stack | **S** | Adopt now — verified RimWorld rule, matches `mythical`+ semantics |
| Per-instance state as optional composition (CompQuality pattern) | **S** | Adopt — one optional component, not fields on every item |
| Containment as uniform holder relation (IThingHolder lesson) | **A** | Adopt at the containers slice |
| Crime-on-the-act for commons; evidence-on-the-thing for instances | **A** | Adopt at the theft slice (with #6) |
| Litter decay for world-dropped commons | **B** | Adapt — despawn pressure, deterministic timer, never for instances |
| OSRS notes/placeholders | **D** | Do not adopt — UI patches for a fungibility gap we don't have |
| State encoded as id families (charge-level ids) | **D** | Do not adopt — combinatorial ids, laundered state |
| Everything-is-an-instance (EVE) | **D** | Do not adopt — bloat + allocation + determinism cost for zero need |
| Per-item stolen flags on commons (Skyrim) | **D** | Do not adopt — laundering exploit class, contradicts fungibility |

## Deep-read sources (for later verification if ever needed)

munique.net/item-duplication-exploits · oldschool.runescape.wiki (Server_crash_glitch, Bank,
Stackable_items, Bank_Placeholders update) · local `rimworld-decomp` (`Verse/Thing.cs`,
`RimWorld/CompQuality.cs`, `RimWorld/MinifiedThing.cs`) · minecraft.wiki/w/Data_component_format ·
eveonline.com dev-blogs (inventory improvements, DB history) · en.uesp.net/wiki/Skyrim:Crime.
