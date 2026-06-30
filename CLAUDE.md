# Ballpiece — Claude Code Context

A **One Piece-inspired open-world action-RPG** (Rell Seas / Necesse / OSRS-like systems). Fresh, clean
Phaser + TypeScript + ECS build under `app/`. The old `grand_voyage.html` is a **behavioral reference only**
— not built upon.

## Required reading
- `docs/ARCHITECTURE.md` — ECS-lite foundation: components, systems, the **data-driven faction matrix**, and
  **control-as-a-component (the Moat — the player is not special)**. Read before changing architecture.
- `docs/ARCHITECTURE_SCALE.md` — how the foundation scales to the full vision: content **Registries**,
  **GAS-lite combat** (Attributes + Abilities + Effects + Tags), modifier stacking, world/zones, event
  director, persistence. Read before designing a new system.
- `docs/design/` — the target vision (`VISION.md` first). Ahead of the code on purpose.

## Tech stack
- Phaser **3.90** (Canvas), **TypeScript**, **Vite 5**, **Vitest**. Procedural Graphics (no sprite assets).
- Fixed 1280×720, `Scale.FIT`. Everything under `app/`.

## Key architecture decisions (don't violate)
- **Content is data, code is generic.** Fruits/weapons/items/abilities/zones/events/… are Defs in typed
  `Registry`s (`core/Registry.ts`). Definition vs Instance. No hardcoded content lists, no `if (name === …)`.
- **One combat engine (GAS-lite).** The four layers (Devil Fruit + Haki + Weapon class + Fighting style) +
  Combat Potentials all grant **Abilities + Modifiers + Tags** into one engine. Stats only via
  `combat/Stat.ts` (`StatBlock`) + `combat/Modifier.ts` (flat → addPct → mulPct → override, source-tracked).
- **Factions = data-driven relations matrix** (`defs/factions.ts`); never team checks.
- **Control = a component.** `InputSystem` drives `world.first('control')`; possess any character.
- **AI = `Brain` strategy** (FSM now → behavior-tree/utility later). Logic in `systems/`, not scenes.
- Typed **EventBus** for discrete events; **registry** for HUD state; **pool** transient FX.

## Commands (run from `app/`)
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm test`

## Status
Runnable, browser-verified vertical slice: terrain, hero movement, enemy FSM, melee + FX, death/respawn,
HUD, minimap, faction-based hostility. Combat **foundation primitives** landed & unit-tested:
`core/Registry`, `combat/Stat`+`Modifier`, `combat/Tags`, `combat/PowerTier`.
**Next:** Ability + Effect engine (port punch/dodge into it), then equip one of each combat layer end-to-end.
