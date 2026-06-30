# Ships & Naval Combat (Design)

Ships are first-class entities (and, architecturally, **composite actors** — a hull with part components).

## Ship classes
**Sloop** (starter, fast, fragile) → **Caravel** (mid) → **Galleon** (heavy, durable) → **Submarine / bubble
boats** (underwater, future). Each class is a `ShipHullDef` with base stats + part slots.

## Ship stats
Speed, Armour, **Weaponry** (cannon slots), Turn Speed, Ram Strength, Health (+ Anchor system). Customizable
via **parts** and upgrades (shipwright talent).

## Parts & customization
Ships have **parts** (hull, sails, figurehead, cannons, ram, …) — each a component contributing modifiers to
ship stats. Customization = swapping part defs (data-driven, like character gear).

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
- Spawn a ship via a **ship-in-a-bottle** item. **Unanchored ships can be stolen** by other players/NPCs →
  the **anchor** is a meaningful state.
- Sailing is also a **talent** (cap 500).

## Engine implications (preview)
- A ship = an entity with `transform/mover(mode:'boat')/health(as hull)/shipHull/parts[]/attributes`. Player
  on deck = the walkable-ship feature (`features/big-walkable-ship.md`) — entities parented to the ship frame.
- Modes = an FSM (Brain or a dedicated `ShipMode` component). Cannons/ram = Abilities in the shared engine.
- Theft/anchor = state + faction/ownership tags.
