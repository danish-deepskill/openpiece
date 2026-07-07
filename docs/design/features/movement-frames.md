# Movement Frames — the reference-frame foundation

**Status: BUILT.** The architectural fix behind "the deck should feel like land."

**Unification landed:** ALL locomotion — world AND deck frame — now lives in ONE system (`MovementSystem`), one
tick phase. `InputSystem` only writes the frame-neutral intent (`mover.vx/vy`); `MovementSystem.moveOnDeck`
resolves the deck-frame case beside jump/land/perch/airborne-leave. This killed the deck-jump bug class whose
ROOT was: deck locomotion lived in InputSystem while world locomotion + jump/land/perch lived in MovementSystem —
split across two tick phases, so a deck jumper's move and its landing state were perpetually a tick out of sync
(you'd get stuck on the rail, or flung off). One system + one phase = no stale state. `ShipSystem` keeps only the
frame-transition primitives (enterDeck/exitDeck), parenting, and piloting; its `walkDeck` is gone.

## The problem (a symptom the canon warns about)

Being on a ship's deck currently changes the whole input/movement pipeline: `InputSystem` has an `if (e.onDeck) { walk-or-pilot; return }` that SKIPS all combat/aim/jump/abilities, and `MovementSystem` has grown `!e.onDeck` special-cases. So the deck is a "special mode" — you're disarmed the moment you board. That contradicts the **Moat** (the player isn't special — and neither is a *location*): standing on a deck should no more strip your abilities than standing on sand vs. grass does.

The root cause is one design flaw: **movement is expressed as world-space velocity (`mover.vx/vy`) integrated against the world grid — the world is HARD-CODED as the frame of reference.** A deck is a different reference frame (moving, rotating), so the code special-cases it with a branch. Every "re-enable X on the deck" fix is a symptom of this. Fixing them one-by-one is the hotfix trap; the foundation is to make movement **frame-agnostic**.

## The foundation: a movement FRAME (peer of MoveMode / Layer)

An actor lives in exactly one **movement frame** — the coordinate space its position + locomotion resolve against. It's a discrete fact, modeled like `MoveMode` ('foot'|'boat'|'swim') and `Layer` ('ground'|'air') already are: a small typed field every system reads UNIFORMLY, never branches around ad-hoc.

- **World frame** (default): position is world px; locomotion resolves against the ocean/island `TileGrid` (`Collision`).
- **Deck frame** (`onDeck{shipId,lx,ly}`): position is deck-LOCAL px; locomotion resolves against that hull's `DeckGrid` (deck collision); world position is DERIVED each tick by parenting (`world = ship ∘ local`).

Boarding = **switching your movement frame** (world → deck). Leaving = deck → world. Deck→deck (battle boarding) and a future crow's-nest/cannon-platform are just more frames — the transition is one generic primitive (`enterFrame`/`exitFrame`), per the naval-battle AI design.

## What flows where (the ONE code path)

The whole point: **no system branches on "am I on a deck." They branch on the FRAME, uniformly — or don't branch at all.**

- **Input** produces a frame-NEUTRAL movement INTENT (a direction + speed), and runs ALL actions (aim, attack, abilities, jump, guard, stance) UNCONDITIONALLY. Actions already operate on WORLD position (`t.x/y/angle`), which parenting keeps correct in every frame — so they "just work" aboard with zero special-casing. Input never again reads `onDeck` to gate actions.
- **Locomotion** applies the intent in the actor's frame:
  - world frame → the existing world-grid integration (`mover.vx/vy` vs `Collision`).
  - deck frame → move the LOCAL position (`onDeck.lx/ly`) vs deck collision (`deckTryMove`); world pos re-derives via parenting.
  This is ONE resolution step that dispatches on the frame, not two scattered paths.
- **Jump / Geppo** is a vertical action WITHIN the current frame. On a deck you rise off the deck and land back on it because the FRAME carries your horizontal position (you're still deck-framed while airborne; only your `Layer` is 'air'). Leaving the ship by jumping the rail = a deliberate FRAME TRANSITION at the apex/landing (the rail is a low wall the air layer clears), not a special "deck jump."
- **Piloting** stays positional (on the helm tile) and is the one genuinely deck-only ACTION — but it's gated on standing on a `helm` cell (data), not on "being a special deck mode."

## Why this is the foundation, not a wiring job

- **Combat on deck, jump-between-ships, air combat** all fall out for free — nothing knows the deck is special, so nothing has to be taught to work there.
- **Future nested frames** (crow's nest on a ship, a moving platform, a cannon you ride) are new frames, not new special-cases.
- It DELETES the creeping `!e.onDeck` branches (MovementSystem's mode-derive, the InputSystem early-return) instead of adding more.
- The frame is DATA (a component fact), so it serializes, replays, and works headless — same as MoveMode/Layer.

## Build order

1. Input: split into ACTIONS (always run) + a frame-neutral movement INTENT; drop the `onDeck` early-return so aim/attack/abilities/jump run aboard. Route the intent to `walkDeck` when deck-framed, world `vx/vy` when world-framed — the ONE dispatch. Guard the double-apply (deck-framed must not also set world `vx/vy`).
2. Jump/Geppo deck-relative: a deck-framed jumper stays deck-framed (Layer='air'), lands back on the moving deck.
3. Generic frame transition (`enterFrame`/`exitFrame`) — folds boarding + the deferred gangplank walk-on/off + future deck→deck into one primitive.
4. Collapse the remaining `!e.onDeck` special-cases in MovementSystem into the frame dispatch.

Each step typecheck + Vitest green. Keep this doc + `big-walkable-ship.md` in sync.
