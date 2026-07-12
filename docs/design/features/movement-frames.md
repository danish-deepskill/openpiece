# Movement Frames — the reference-frame foundation

**Status: BUILT.** The architectural fix behind "the deck should feel like land."

**Unification landed:** ALL locomotion — world AND deck frame — now lives in ONE system (`MovementSystem`), one
tick phase. `InputSystem` only writes the frame-neutral intent (`mover.vx/vy`); `MovementSystem.moveOnDeck`
resolves the deck-frame case beside jump/land/perch/airborne-leave. This killed the deck-jump bug class whose
ROOT was: deck locomotion lived in InputSystem while world locomotion + jump/land/perch lived in MovementSystem —
split across two tick phases, so a deck jumper's move and its landing state were perpetually a tick out of sync
(you'd get stuck on the rail, or flung off). One system + one phase = no stale state. The frame-transition
primitives live in `world/frames.ts` (enterDeck/exitDeck/inFrameCooldown) — the ONE world↔deck handoff every
caller goes through (a raw `onDeck` write once made swimmers drown standing on deck); `ShipSystem` keeps only
parenting + piloting; its `walkDeck` is gone.

## The problem it solved (a symptom the canon warns about)

Being on a ship's deck used to change the whole input/movement pipeline: `InputSystem` had an `if (e.onDeck) { walk-or-pilot; return }` that SKIPPED all combat/aim/jump/abilities, and `MovementSystem` had grown `!e.onDeck` special-cases. The deck was a "special mode" — you were disarmed the moment you boarded. That contradicts the **Moat** (the player isn't special — and neither is a *location*): standing on a deck should no more strip your abilities than standing on sand vs. grass does.

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

## The transition rulebook (battle-tested — four playtest rounds of snap/freeze bugs distilled)

Every rule below exists because its violation shipped a real bug. Break one and the same bug family returns.

1. **A transition NEVER moves the body** — with ONE named exception. Transitions through OPEN ground (the
   gangplank door, airborne leaves, boarding) are pure address-book switches: convert the CURRENT point
   between frames, never a lookahead or a snap target. The exception is the RAIL DROP-OFF under full-tile
   rails (the simple-collision overhaul): the perch spot has NO legal in-place world position (it's inside
   the solid block), so stepping off is ONE deliberate bounded hop past the block's seaward face — an
   intentional step-down, exactly like descending a world stone wall, replacing what otherwise surfaced as
   an accidental deep-eject snap. Everything else keeps the zero-displacement rule.
2. **Every deck ENTRY is gated on a LEGAL deck state** (the landing spot must satisfy deck collision, else
   perch). No entry may create an impossible position and hope later ticks fix it.
3. **Direction-aware doors, not cooldowns.** The gangplank pair (walk-on/walk-off) is input-asymmetric
   (inward intent boards, outward leaves), so it cannot oscillate — cooldown mutes on transitions were the
   OLD bug source, not the fix.
4. **Perch-as-needed landings in BOTH frames:** if grounded rules reject the landing cell, set `onLedge`
   rather than rejecting/teleporting the landing.
5. **Depenetration is nearest-clear-spot, never a radial fling** — and an embedded body keeps its veto lifted
   (the hull veto applies only from CLEAR positions) so it can walk itself free instead of deadlocking.

## Frames-as-LEVELS (where this goes next)

A frame is not just "the deck of one ship" — it's the general level primitive. Lower decks, holds, caves, and
pocket interiors are MORE GRIDS with their own colliders + structure indexes, entered through hatch/ladder
transitions built on the same `frames.ts` primitives (RimWorld ships this exact shape as pocket maps; our
moving frames are a superset). Multi-level is NEVER a z-axis — elevation stays discrete states
(air layer / onLedge / submerged / which-frame). Recorded naval triggers: an airborne body INHERITS the
velocity of the frame it leaves (leap between moving ships) — add at `exitDeck` when naval battles land;
cross-frame pathfinding = a portal graph (frames are rooms; gangplank/hatch/leap edges are doors,
capability-gated by jump/Geppo). The FULL planning architecture — solver core, regions, portals, shared
fields, squad/division movement, and its build triggers — is `docs/design/PATHFINDING.md`.

Keep this doc + `big-walkable-ship.md` in sync.
