# The Sea Catalog — everything sailing can become, mapped to its substrate

> **Stage:** capture — breadth map of sailing-adjacent ideas by substrate; graduates via passes

> The BREADTH pass for sailing-adjacent mechanics/events/features (2026-07, developer-requested "so we can
> have the picture"). Not a backlog — a MAP: every One Piece sea idea we could name, tagged with the
> SUBSTRATE it rides on. The punchline the map exists to show: **nothing here demands a ninth substrate** —
> five of the eight are already built or in flight. Judged designs graduate to `SAILING.md`/`NAVAL.md`/
> `DESIGN_BACKLOG.md` passes; this file just keeps the space visible.
> Tiers: **near** = rides shipped systems · **mid** = needs a designed-but-unbuilt substrate · **far** =
> needs a deferred substrate (chunked sea, crew jobs, parts).

## The eight substrates (the whole catalog reduces to these)

1. **Wind field + modifiers** — wind as evaluated field (SAILING.md piece #1; field restructure pending)
2. **Currents field** — a second sampler of the same shape, pushing hulls directly (unbuilt, cheap)
3. **Event director** — spawns/schedules encounters + weather events (`EVENTS.md`)
4. **Sail/anchor states + damage pipeline** — the ship's own state machines (SAILING.md pieces #3/#5 + sinking)
5. **Parts on the deck grid** — structures at sea; player-built ships (backlog #11)
6. **Crew jobs** — stations/roles/routines (backlog #1)
7. **Knowledge economy** — information as gated, decaying, positional (ai/AI_INTELLIGENCE.md)
8. **Movement frames** — walkable moving grids (SHIPPED — the quiet enabler of the wildest rows)

## 1 · Wind field + modifiers
- **Calm Belts** (near, once field lands) — regions where the field reads ~0: sail ships strand, oars cross;
  Sea King territory makes the shortcut a gamble. The rowboat's flat curve already handles the oar side.
- **Grand Line vs Blues weather** (near) — per-region field parameters: veer rate, strength band, storm rate.
- **Squalls/storms** (mid — wants sail states) — event spikes; full sail in a squall risks canvas/mast damage
  → REEFING BEFORE WEATHER becomes the core sail-state decision.
- **Cyclones with paths** (mid) — moving field modifiers; Nami-tier forecast reads them hours out.
- **Fog banks / Florian Triangle** (mid) — visibility modifiers into the existing perception system:
  ambushes, ghost-ship encounters, stealth approaches.

## 2 · Currents field
- **Reverse Mountain** (mid) — a one-way current ramp; the canonical Grand Line entrance.
- **Whirlpools** (mid) — point vortices: hazard + navigator-information showcase.
- **Aqua Laguna** (mid) — a scheduled tidal surge event (timed escape, port flooding).
- **Tides** (mid) — periodic level changes opening/closing shallow passages (grounding rules make sandbars real).

## 3 · Event director
- **Sea Kings** (mid) — leviathans in calm belts/deep water; region-scaled.
- **Patrols/convoys as real assets** (mid) — sail real routes from real bases (the escalation-ladder law).
- **Third-party sea battles** (mid) — witnessable; intervene or loot the aftermath.
- **Ghost ships/derelicts** (mid) — salvage, hauntings, ambush shells.
- **Castaways + message bottles** (near) — micro-events: recruits, maps, rumors.
- **Mobile neutral ports (Baratie)** (mid) — moving POIs with truce rules.
- **Bounty-hunter interceptors** (mid) — triggered past bounty thresholds along YOUR known routes.

## 4 · Sail/anchor states + damage pipeline
- **Reef-before-the-squall** (mid) — see storms above; the decision that makes weather gameplay.
- **Anchor turn** (designed) — the at-speed handbrake pivot.
- **Breach → flood → bail → patch** (designed — SAILING.md sinking pipeline).
- **Fire aboard** (mid) — spreads cell-by-cell on the deck grid; bucket line = a crew job.
- **Careening/barnacles** (far) — hull fouling as slow speed decay → maintenance as a voyage rhythm;
  deliberate beaching doubles as the raid-entry trick (SAILING.md impacts).

## 5 · Parts on the deck grid (backlog #11 — YOUR BUILD IS YOUR SAIL CURVE)
- **Ammo as content** (mid) — chain shot (rigging → slow), grape (crew), heated (fire).
- **Ram prows** (mid) — shifts the ram-damage split (NAVAL law: every part a trade-off).
- **Franky-tech paddle/engine** (far) — flat-curve propulsion that burns cola: rows, not code.
- **Carried dinghies** (far) — boarding parties without bringing the galleon.
- **Coating (Sabaody)** (far) — the conversion that opens the undersea route (see substrate 8).

## 6 · Crew jobs (backlog #1 — "the next SAILING-grade pass")
- **Lookout in the crow's nest** (mid) — crew-skill perception radius; "Sail ho!" callouts.
- **Stations** (mid) — helm/capstan/sails; sail states capped by hands aboard.
- **Provisions/fishing/cook quality** (mid — backlog #2) — voyage planning pressure.
- **Klabautermann** (far) — a beloved ship's spirit as an EARNED morale/luck modifier: ship HISTORY matters
  (the Going Merry arc as mechanics).

## 7 · Knowledge economy
- **Log Pose lock-in** (mid) — island magnetism timers as voyage pacing; **Eternal Poses** as loot.
- **Chart-making** (mid) — fog-of-sea you survey and SELL (Nami's dream as a loop).
- **The forecast** (designed) — the seeded field read; skill = hours of lookahead.
- **News Coo** (mid) — information travels physically; your bounty is stale three islands away.
- **Sea rumors at ports** (mid) — hooks whose truth decays with distance/time.

## 8 · Movement frames (shipped)
- **Zou** (far) — a walkable creature = a moving frame with a route; exactly a ship, bigger.
- **Coated undersea sailing** (far) — a frame whose "wind" is all current + an air timer; trench events.
- **Sky seas** (far) — the White Sea = another fluid field with its own curves; Knock Up Stream = the
  event-director launch that gets you there.
- **Grappling/boarding lines** (mid) — a constraint between two moving frames; pulls hulls together for
  deck fights (big-walkable-ship.md's battle boarding).

## Standing cruelties (already true, worth naming)
- **Devil-fruit users vs the sea** — knockback overboard is lethal stakes for hammers; falls out of the
  existing swim/drown rules. Sea-prism stone generalizes it to items.
- **The sea itself as the difficulty dial** — region field parameters + encounter tables ARE the game's
  difficulty curve; no level-gating needed (the OSRS lesson: danger is geography).
