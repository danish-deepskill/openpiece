# Walkable Ships (Design)

> **Stage:** building — steps 1-4 shipped; step 5 (crew) awaits the crew pass

Referenced by `NAVAL.md` ("Player on deck = entities parented to the ship frame"). **Design only — not built.**
Ships today are a rigid pod: you board → you're teleported to a fixed seat slot and glued there. This pillar
makes a ship a **moving walkable platform** — you stand at a real spot on the deck, walk around, and *choose* to
man the helm to pilot; your crew walks the deck too. Scales to the galleon (bigger deck = more room), same code.

## Reference: RimWorld's Gravship (Odyssey DLC) — the first-party prior art

RimWorld's **Gravship** is a base-game walkable ship: built from deck tiles, walked on, piloted from a helm
console, moved+rotated as a unit. (Source in `C:\Files\Phaser\References\rimworld\rimworld-decomp` — the load-
bearing files: `Building_GravEngine.cs`, `Planet/Gravship.cs`, `GravshipPlacementUtility.cs`,
`PrefabUtility.cs`, `GravshipUtility.cs`; data in `Odyssey/.../Terrain_Foundation.xml` + `Buildings_Gravship.xml`.
Patterns only — Ludeon copyright, never copy code.) Patterns worth ADAPTING:

- **Ship = tiles derived from a ROOT by flood-fill, not a declared blob.** The deck is "Substructure floor cells
  connected to the engine" (`GetConnectedSubstructure` flood-fills from the engine over deck-terrain tiles),
  cached behind a dirty flag (`SubstructureGrid` makes "is this cell on the ship" an O(1) lookup). A single
  **footprint radius** (`CompProperties_SubstructureFootprint`) bounds the ship's max size with one number.
- **Local↔world transform = a 4-way integer rotation + translation, cached until heading changes.**
  `PrefabUtility.GetAdjustedLocalPosition(local, rot)`: E `(x,z)→(z,-x)`, S `(x,z)→(-x,-z)`, W `(x,z)→(-z,x)`,
  N identity; `world = root + rotate(offset, heading)`. THIS is our deck-space math (§ below). Multi-tile things
  need `GenAdj.AdjustForRotation` (rotating a 2×3 station isn't just rotating its origin).
- **Hull = data: deck-terrain-def + footprint-radius + engine + station buildings each tagged with a required-
  ROLE def and linked to the engine** (`GravshipComponentTypeDef` lists roles; `CompProperties_GravshipFacility`
  tags a building's role; validity = "the flood-filled set has one of each `requiredForLaunch` role"). Maps
  cleanly onto our content-is-data canon — a hull's stations are rows, not code.
- **Helm = a station at a deck cell; its FACING = ship heading; man it by pathing onto that cell**
  (`CompPilotConsole` + `JobDriver_PilotConsole`). Confirms our "stand on the helm tile to pilot" model.
- **Bounds-packing**: store the deck as a few `CellRect`s, not every cell — cheap rotation/collision/membership.

### THE key architectural fork this reference exposes: LIVE vs. TRANSIENT local frame

RimWorld's Gravship is walked **while stationary** — it only becomes a moving, rotating, local-coordinate object
**transiently** during a launch→travel→land sequence (snapshot every deck thing into engine-relative offsets →
fly as a pure data `WorldObject` → re-stamp at the destination via `root + rotate(offset, heading)`). During
normal play it IS the ordinary map; you walk the plain grid. **RimWorld deliberately never runs a LIVE separate
coordinate frame that moves/rotates relative to the world while pawns walk it** — because then every
cross-boundary query (pathing, line-of-sight, collision, rendering) must transform coordinates every frame. That
"live moving frame + walkable" combination is exactly what the big vehicle MODS (Vehicle Framework, SOS2) add,
and it's why they're large and complex.

**What this means for openpiece — the honest fork:**
- **(A) LIVE local-space parenting** (the rest of this doc): deck actors have live local positions; world =
  ship∘local recomputed every frame; you walk the deck WHILE it sails the ocean. This is what our fantasy wants
  (continuous sail-and-walk), and it's the HARDER path — the mod-tier one RimWorld avoided. Cost: per-frame
  transform of every deck actor's position + a SECOND (deck-local) collision context running continuously.
- **(B) TRANSIENT / snapshot** (RimWorld's actual choice): the ship is stationary-relative while walked; sailing
  is a separate mode (board → the ship is effectively "the ground" → to travel, a transit that snapshots the
  deck). Cheaper (no continuous cross-frame transforms), but the "stroll the deck while cutting across the sea"
  feel is weaker — you don't walk around mid-voyage.

**Recommendation:** the game's whole vibe (a living sea you sail continuously, crew on deck as you go) points at
**(A)**. It IS the harder path, but the pieces are bounded: the transform is the small integer-rotation math
above, and — crucially — **our exact circle-vs-AABB `canOccupy`/`unstick` (already built) IS the deck collision**,
just pointed at the deck grid in local coords. So (A) is "mod-tier" in *ambition* but not in *code volume* for us,
because the two hardest sub-parts (rotation transform, deck collision) are each ~one small, known piece.

**DECISION: (A), the live model — settled by two requirements:**
- **Ship movement = rotate left/right + throttle** (heading-based, like the current ShipSystem — not free strafe).
  This makes the transform continuous + simple: `world = ship.pos + rotate(local, ship.angle)` with a REAL 2D
  rotation (`cos/sin`) run each frame — even simpler than RimWorld's 4-way integer cases, because there are no
  discrete-rotation edge cases; the deck just spins smoothly with the hull as it carves a turn.
- **Ship-to-ship PIRATE BATTLES with cannons** — this REMOVES (B) as an option. A naval fight is: sail +
  maneuver (turn to bring a broadside to bear) WHILE the crew runs the deck manning guns, all at once. The
  transient/snapshot model (B) has the ship stationary while walked → it literally cannot do a battle. So the
  fantasy REQUIRES the live model. (B) is no longer a fallback; (A) is the design.

Build it PHASED (below) so each slice proves out before the next.

## Naval combat — cannons as deck stations (why battle fits this model)

The pirate battle is the same walkable-ship system, weaponized — it needs NO separate combat architecture:
- A **`cannon` deck tile** is a station (like the helm). **Standing on it grants a "fire cannon" Ability**, aimed
  PERPENDICULAR to the ship's heading (the broadside) — port vs. starboard decided by which side of the deck the
  cannon tile is on. Reuses the shared ability engine (the Moat: player or crew mans a gun identically).
- The existing **`cannonSlots`** hull field becomes actual **cannon tiles** in the deck grid (a sloop's 2, a
  galleon's 8 → guns down each side). A `CannonDef` (data) gives damage/reload/projectile-arc per gun type.
- **The battle IS: two walkable ships maneuvering while their crews walk the deck running guns.** Maneuver to
  present a broadside; crew (or you) man the cannons on the engaged side; fire Abilities resolve through the
  same StrikeResolver/Damage path (ship HP = the hull's health, hit-spot multipliers per NAVAL.md). Boarding =
  cross onto the enemy deck (a deck→deck coordinate handoff, same as boarding your own).
- **`NAVAL.md`'s "battle mode"** is then just the crew-on-deck-fighting state; no new engine — cannons/ram/board
  are Abilities, the ship is a walkable platform, damage is the shared path.

## The core model: LOCAL-SPACE PARENTING (a deck coordinate frame)

## The core model: LOCAL-SPACE PARENTING (a deck coordinate frame)

The deck is a small coordinate space that MOVES + ROTATES with the ship. An on-deck entity carries a LOCAL
position (where on the deck it stands); its WORLD position is derived each tick as `ship ∘ local`:

```
world = ship.pos + rotate(local, ship.angle)   // computed by ShipSystem every frame
```

- A new component marks "I'm on a deck": `onDeck?: { shipId; lx; ly }` — the ship it's parented to + its
  LOCAL (deck-frame) x,y. This REPLACES today's `riding: { shipId, seat }` (a fixed seat → a free position).
- The entity's OWN `mover.vx/vy` (from input/AI) moves its LOCAL position (walk around the deck); ShipSystem
  then re-derives world from `ship ∘ local`. So you walk the deck AND ride it as it sails/turns.
- **Why local-space, not "add ship velocity to the rider":** parenting is frame-correct under ROTATION (the
  deck turns and you rotate with it, keeping your spot), composes for nested frames (a future crow's-nest on a
  ship), and is the standard moving-platform solution. Velocity-adding drifts and breaks on turns.

## Deck shape — HOW the walkable area + edges are defined (the key sub-decision)

Two candidates. **Recommendation: a per-hull TILE GRID** — most consistent with the engine, scales cleanly,
authorable. Continuous-polygon is the simpler fallback if tile authoring proves heavy.

**A. Per-hull deck tile grid (RECOMMENDED).** Each `ShipHullDef` carries a small `deck` tile array (a mini
level): `DeckTile = deck | rail | helm | hatch | hole | cannon`. A sloop is a few tiles; a galleon is a big
grid (cabins, multiple stations, holes to fall through). This reuses the tile + `walkable`/collision concepts
you already have (`world/TileGrid`, `world/Collision`) — a SECOND, ship-LOCAL collision context sized to the
hull. Piloting is POSITIONAL: stand on a `helm` tile → you can steer; a `cannon` tile → man that gun (naval
combat later). Data-driven per the canon: a new deck layout = a new `deck` array on the hull def, no code.
  - Pros: rich layouts, distinct stations as TILES (helm/cannon/hatch), scales to galleon + multi-deck, reuses
    tile collision, all data.
  - Cons: authoring each hull's deck grid; a small tile system running per-ship.
  - **RimWorld refinement (later, if ships become BUILDABLE):** RimWorld doesn't author a fixed grid per hull —
    the deck is FLOOD-FILLED from a root (the engine/keel) over "deck" tiles, so a player-BUILT ship is any shape
    the tiles form, bounded by a footprint radius, cached O(1) via a substructure grid (§reference). For openpiece
    NOW, hulls are fixed templates → a static per-hull `deck` array is simpler and enough. Adopt the flood-fill
    root model IF/WHEN players build/modify ships tile-by-tile; the fixed array is a clean subset of it.
  - **Bounds-packing (perf):** store the deck as a few `CellRect`s (rectangles), not every cell — cheap rotation,
    collision windowing, and "is this cell on the ship" tests (RimWorld's `Gravship.occupiedRects`).

**B. Hull polygon / ellipse boundary.** The deck is just the hull outline; you can't walk past the rail, no
interior tiles. Piloting = a proximity ZONE near the stern, not a tile.
  - Pros: one boundary check, zero tile authoring, fast to prototype.
  - Cons: no deck detail (no helm/cannon/hatch tiles, no holes, no cabins); stations become fuzzy zones;
    doesn't scale to interesting galleon interiors. A dead end for the deep-sim ship vision.

**Decision: TILE GRID (A).** The whole engine is tile-based; a ship being "a small floating tile level" is the
consistent, scalable model, and stations-as-tiles is exactly what the galleon/cannon/naval-combat future wants.

## Deck collision (the genuinely hard part)

An on-deck entity moves in LOCAL space and must be walled by the DECK's tiles (can't walk off into the sea),
NOT the ocean grid. So there are TWO collision contexts:
- **World collision** (`world/Collision`) — for grounded/swimming actors vs. the OCEAN tile grid (existing).
- **Deck collision** — for on-deck actors vs. the SHIP's local `deck` grid. A second `Collision` instance
  bound to the hull's deck grid, run in LOCAL coordinates. `rail`/`hole` tiles block (or a `hole` drops you
  through to a lower deck later); `deck`/`helm`/`cannon` are walkable.
- The exact circle-vs-AABB `canOccupy` + `unstick` we built generalize directly — they take a grid + a
  position; point them at the deck grid in local space. (This is why the collision refactor matters here.)
- **The rail is a LOW WALL, not a tall one** — it blocks a foot actor (you can't walk off the deck into the
  sea) BUT an AIRBORNE actor (jump/Geppo, the `air` layer from MOVEMENT_AIR.md) CLEARS it. This reuses the
  existing "airborne clears low terrain" rule — point the deck's low-wall class at the same airborne check the
  ocean grid uses. Emergent payoff: **leaping off the ship = jump the rail; BOARDING an enemy deck in a naval
  battle = jump the rail onto their deck** — no special boarding move, just the movement system. (`hole` is
  also low/clearable; `tall` deck obstacles — a cabin wall, a mast base — would block even airborne, a later
  tile class.) So deck tiles carry a wall HEIGHT (none / low / tall), mirroring the world terrain classes.

## Piloting = a deck POSITION, not a seat

- Stand on the `helm` tile → you gain steering (WASD drives the SHIP's throttle/heading, ShipSystem). Step off
  → you're a free-walking passenger again. No seat assignment; it's where you're STANDING.
- `cannon` tiles (naval combat, deferred) = the same idea: stand at a gun → a fire Ability aimed off that
  broadside. Reuses the shared ability engine (NAVAL.md).
- The `seats` hull field (crew CAPACITY) stays as a boarding cap; "who's piloting" becomes positional.

## Crew (AI) on deck

- A recruited crew member boards → gets an `onDeck` + a starting local spot; its brain runs in DECK-LOCAL space
  (wander/idle on the deck, or a future "man a station" job). Same Brain interface; the space it plans in is the
  deck grid, not the world. A "take a cannon"/"hold the helm" job is a natural later AI addition.
- The Moat holds: the SAME movement/collision code runs for the player and crew on deck.

## Rendering

- Draw the deck as the hull's `deck` tile grid (a proper multi-tile platform rotated to `ship.angle`), NOT one
  sprite — so the galleon reads as a big ship with structure, and stations (helm/cannon) are visible tiles.
- On-deck actors draw at their WORLD-composed position, depth-sorted ABOVE the deck (you're on it). Existing
  `RenderSystem` depth bands + the `rotateToAngle` ship draw are the starting point.
- Boarding/disembarking = the coordinate handoff: world-space actor → pick a deck local spot (gangplank tile);
  disembark → deck-local → a world landing spot (existing `landingSpot`). One conversion each way.

## Composition summary

```
Ship = transform + mover(mode:'boat') + ship(hull) + a per-hull DECK tile grid (new: on the hull def)
On-deck actor = onDeck{shipId, lx, ly}  (replaces riding{shipId, seat})
  ├─ moves its LOCAL pos via its own mover (walk the deck) — DECK collision (ship-local grid) walls the rails
  ├─ world pos = ship ∘ local, recomputed each tick (rides the deck as it sails/turns)
  ├─ on a `helm` tile → pilots the ship; on a `cannon` tile → mans that gun (naval, later)
  └─ crew AI runs in deck-local space (same Brain), a future "man a station" job
Two collision contexts: WORLD (ocean grid) for off-ship actors, DECK (hull grid) for on-ship — same
  circle-vs-AABB canOccupy/unstick, different grid.
```

## Build order when the pillar is committed (NOT now) — phased, each green-gated

1. **Deck grid on the hull def** + a deck `Collision` context; render the sloop's deck as tiles (no walking yet).
2. **`onDeck` local-space parenting**: replace `riding` seat-pin with a local pos; world = ship ∘ local each tick.
   Player boards → stands at a spot (not a seat), rides the deck as it moves/turns. (Still can't walk — vx/vy 0.)
3. **Walk on deck**: player input drives the LOCAL pos; DECK collision walls the rails. Depth-sort on deck.
4. **Helm piloting**: stand on the `helm` tile → steer; step off → free passenger.
5. **Crew on deck**: followers board with an `onDeck`; their brain walks the deck (deck-local).
6. **Boarding/disembark handoff** polish; then the GALLEON (a bigger deck grid — pure data + step 1's renderer).
   Naval combat (cannon tiles + fire abilities) and multi-deck/hatches are their own later features on this base.

Each step is typecheck + Vitest green; steps 1–4 are the spine, 5–6 broaden it. Keep this doc, `NAVAL.md`, and
`ROADMAP` in sync when built.

## Naval-battle AI: PER-FRAME pathfinding + CROSS-FRAME transition actions (design, not built)

A ship battle has MULTIPLE moving coordinate frames (your deck, each enemy deck, the open sea between) plus an
AIR layer (Geppo/jump crossings). A crew member deciding "cross to the enemy ship and fight the captain" plans
across frames that are rotating and sailing relative to each other. The naive approach — one giant pathfinder
over the whole battle — falls apart under moving frames. The architecture (settled direction, build later):

**Pathfind WITHIN a frame; DECIDE between frames.**
- **World grid** — the ocean/islands. Existing `pathable` A*, unchanged.
- **Each ship's DECK grid** — a tiny local A* over that hull's `DeckGrid` (~6×4 cells, dirt cheap), run in the
  ship's LOCAL frame, so it's immune to the hull moving/rotating. The deck-frame twin of the world pathfinder.
- **The AIR layer** — NOT a grid. A Geppo/jump crossing is a BALLISTIC HOP between two points, validated by a
  reachability + lead-aim check, not an A* path.

**A cross-ship goal is a SEQUENCE of frame-local plans stitched by TRANSITION actions**, e.g. attack an enemy
captain who is `onDeck: enemyShip`:
1. `[deck path]`  walk across MY deck to the boarding edge          — my ship's local A*
2. `[transition]` BOARD: cross the gangplank OR Geppo-hop the gap   — a frame-transition action
3. `[deck path]`  walk across THEIR deck to the captain             — enemy ship's local A*
4. `[combat]`     engage                                            — existing combat

Each leg uses the pathfinder its frame already has; only the TRANSITION is new — and it's the same world↔deck
coordinate handoff as boarding, generalized to **deck↔deck**. THIS is why the handoff must be built as a GENERIC
frame-transition primitive (`enterDeck(actor, ship, localSpot)` / `exitDeck(actor)`), not a one-off "board from
the dock" — so deck→deck battle boarding and Geppo-land reuse it verbatim.

**Geppo / air crossing = an extra EDGE in the unit's decision graph** (only if it has the Geppo ability — the
Moat: capability is unit data, not special-case code):
- **Reachability:** is the target deck within Geppo range given both ships' CURRENT positions? Recomputed as they
  move — a closing gap opens the hop, a widening one closes it.
- **Lead-aim the landing:** the enemy deck is MOVING, so aim where it WILL be — reuse the Gomu lead-aim already
  built for Luffy.
- **Land handoff:** on landing, `worldToDeck(enemyShip, landingPoint)` → the unit is now `onDeck: enemyShip`.
  Same coordinate handoff, different ship.
- **Fighting in the AIR** = combat while `layer:'air'` with no `onDeck` — a world-space airborne actor. Two Geppo
  users clashing mid-hop is just combat between two airborne world actors. No new engine.

So a ground crew member paths to the gangplank and boards; a Geppo crew member leaps the gap — two edges to the
same goal, chosen by the unit's capabilities. Build order for this layer (AFTER the spine + solid-hull handoff):
deck-local A* → crew "board & fight" behavior → Geppo air-edge + lead-aim landing → air combat polish.
