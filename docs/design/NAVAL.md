# Ships & Naval Combat (Design)

Ships are first-class entities (and, architecturally, **composite actors** — a hull with part components).
The MOVEMENT half — wind, points of sail, momentum, anchor states, grounding/ramming/projectile impacts —
is designed in `SAILING.md` (the sailing model this combat layer stands on).

## Ship classes — AXES, not a tier ladder (judged 2026-07)

A linear "sloop → caravel → galleon → battleship" ladder obsoletes every earlier ship and converges on one
"best" hull. Classes are instead ROLE ARCHETYPES positioned on four MECHANICAL axes (all fields on
`ShipHullDef`; the mechanics live in `SAILING.md`):
- **RIG** — the sailCurve shape: fore-and-aft points close to the wind; square dominates downwind; mixed
  compromises; oars ignore wind entirely.
- **SIZE** — the deck grid: crew capacity, cannon slots, MASS (feeds ram physics + turning).
- **DRAFT** — deep-draft hulls CANNOT enter shallow water (the terrain kind already exists): a galleon
  literally can't chase a sloop over the reef. This one field keeps small ships relevant FOREVER —
  smuggler runs, river raids, escapes.
- **CREW REQUIREMENT** — a big ship's sail states are CAPPED by crew aboard (two people can't work a ship
  of the line's canvas): hull progression is gated by the crew you RECRUITED, not gold alone — ship story
  and crew story become the same story.

The roster as archetypes: **dinghy** (oars, anywhere) · **sloop** (close-pointing shallow-draft scout) ·
**ketch/schooner** (fast reacher, the chase hunter) · **brig** (balanced small warship) · **caravel**
(mixed-rig explorer) · **galleon** (broad-reach cargo fortress, deep draft) · **ship of the line** (endgame
broadside siege, terrible upwind, crew-hungry) · **submarine / bubble boats** (underwater, future).

## Ship stats
Speed, Armour, **Weaponry** (cannon slots), Turn Speed, Ram Strength, Health (+ Anchor system). Customizable
via **parts** and upgrades (shipwright talent).

## Parts & customization
Ships have **parts** (hull, sails, figurehead, cannons, ram, …) — each a component contributing modifiers to
ship stats. Customization = swapping part defs (data-driven, like character gear).
**The upgrade LAW: every part is a TRADE-OFF along an axis, never a pure plus** — armor plating: +hull,
+mass → slower accel, deeper draft; racing sails: higher curve peak, −storm durability; ram prow: shifts the
ram-damage split, bow weight → worse turning. "Speed ship" / "armored ship" are BUILDS the player assembles,
never strictly-better buttons. Part QUALITY (shipwright craft) is the smooth numeric axis on top of the
qualitative part CHOICE — the mirror of SAILING.md's skill-band rule.

## Two modes (state machine)
- **Exploration mode** — sailing, navigation, hazard avoidance, events trigger.
- **Battle mode** — ship-to-ship combat: aim/fire cannon batteries, manage broadsides, ram, board.
Switching modes swaps the active control/ability set (mirrors character mode-switching).

## Cannons / weaponry
Cannon types: **Heavy, Burst, Mortar**, … each a `CannonDef` (damage, arc, reload, projectile arc). Slotted
into weaponry slots. Damage-multiplier hit-spots (yellow→orange→red) apply to ship combat.

## Naval combat
Ship-to-ship reuses the **same attribute/ability/effect engine** as characters (ships have Health/Armour
attributes, cannons are abilities, fire/flood are effects). Crews matter; many events want coordinated crews.

## Sailing & ownership
- **Unanchored ships can be stolen** by other players/NPCs →
  the **anchor** is a meaningful state.
- Sailing is also a **talent** (cap 500).

## Engine implications (preview)
- A ship = an entity with `transform/mover(mode:'boat')/health(as hull)/shipHull/parts[]/attributes`. Player
  on deck = the walkable-ship feature (`features/big-walkable-ship.md`) — entities parented to the ship frame.
- Modes = an FSM (Brain or a dedicated `ShipMode` component). Cannons/ram = Abilities in the shared engine.
- Theft/anchor = state + faction/ownership tags.
