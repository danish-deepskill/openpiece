# Openpiece

A free, fan-made, **One Piece-inspired open-world action-RPG** — a living, deeply simulated sea you
rise through from F-tier nobody to legend of the era.

**🎮 Play the current slice:** https://openpiece.vercel.app
**📖 Read the design (the community site):** https://openpiece-community.vercel.app

## The promises

Most pirate games break the same five promises. This project exists to keep them:

- **The world runs without you.** Every character is simulated by the same rules you are — crews rise,
  marines get promoted, wars happen offscreen. Follow an NPC for three years and watch him become
  someone. Nobody is "just an NPC."
- **There are no bosses.** The strong are simply people who grew strong under the same laws you play
  by. Anyone can be fought, followed, robbed, recruited — or become you: **control is a component**,
  and you can possess any character in the world.
- **Sailing is the real thing.** A genuine wind-and-canvas model — points of sail, momentum, drift,
  being caught in irons — not a car reskinned as a boat.
- **Growth is a biography, not an XP bar.** Skills grow by use, knowledge is loot you can trade or
  steal, and fame comes only from deeds that were actually witnessed. The world keeps the receipts.
- **Free forever.** No price tag, no paywalls, no paid anything. Donations buy nothing.

## What runs today

A playable vertical slice: a living sea with islands, data-driven AI (per-unit profiles + FSM brains),
the four-layer combat engine (Devil Fruit + Haki + weapon + fighting style as one GAS-lite system, with
the Gomu fruit working end-to-end), factions with a relations matrix, wildlife, squads, walkable ships
with Sailing 1.0 (wind, points of sail, anchor work), dialogue and interaction verbs, HUD and minimap.

In-game, the backtick key (`` ` ``) opens the debug panel — AI state, vision, combat reach overlays.

## Run it locally

```bash
cd app
npm install
npm run dev        # dev server
npm run typecheck  # strict TS gate
npm test           # headless sim tests (Vitest)
npm run build      # production build
```

Phaser 3.90 (Canvas) · TypeScript (fully strict) · Vite 5 · Vitest. No sprite assets — everything is
procedural graphics.

## How it's built

The architecture serves one endgame: a Kenshi-tier world simulation that can someday run
server-authoritative multiplayer. The load-bearing decisions:

- **Content is data, code is generic.** Fruits, weapons, units, abilities, factions, ships — all typed
  `Def` rows in registries. No hardcoded content, no `if (name === …)`.
- **The simulation is engine-agnostic and deterministic.** No Phaser imports in the sim folders
  (enforced by a test), seeded RNG streams, fixed timestep. The sim runs headless in the test suite
  today — that's the future dedicated server, in miniature.
- **One combat engine.** Every power source grants abilities, modifiers, and tags into the same
  system. Stats flow through one modifier pipeline, source-tracked.
- **The player is not special.** Input drives whichever entity carries the `control` component. AI
  drives the rest. Possession is moving one component.

The coding canon lives in [`docs/DESIGN_PATTERNS.md`](docs/DESIGN_PATTERNS.md); the architecture in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/ARCHITECTURE_SCALE.md`](docs/ARCHITECTURE_SCALE.md).

## This repo is design-heavy on purpose

The docs outweigh the code, deliberately — the design is engineered before the systems are built:

- [`docs/design/`](docs/design/) — the vision and per-system design docs;
  [`DESIGN_BACKLOG.md`](docs/design/DESIGN_BACKLOG.md) is the living ledger of every design decision.
- [`docs/references/`](docs/references/) — studied prior art (RimWorld's systems, sailing references,
  edge-case catalogs).
- [`tools/`](tools/) — the world map builder (paint the sea, one chunk per cell) and the asset pipeline.

## Legal

Openpiece is a non-commercial fan project inspired by Eiichiro Oda's One Piece. It is not affiliated
with, endorsed by, or connected to Eiichiro Oda, Shueisha, Toei Animation, or any rights holder. All
original characters, names, and materials from One Piece belong to their respective owners. The game
is free, forever, and nothing in or around it is for sale.
