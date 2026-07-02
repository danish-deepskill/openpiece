---
name: add-system
description: Add or rewire a system in the fixed tick — sim vs presentation boundary, constructor injection, update-order placement in WorldScene, headless testability. Use when creating a new System class or changing the sim update order.
---

One system = one job, stated in its class JSDoc — if the JSDoc needs "and", split it. `docs/DESIGN_PATTERNS.md`
§5 is the authority; `app/src/scenes/WorldScene.ts` is the composition root.

## Decide the boundary FIRST
- **Sim system** — must be constructible with ZERO Phaser (the headless server/tests will run it). It goes in
  the `stepSim()` chain. `app/test/architecture.test.ts` forbids ANY `phaser` import in sim dirs — runtime OR
  type-only — via an explicit presentation allowlist; a new sim system must NOT need an allowlist entry.
- **Presentation system** — takes `scene: Phaser.Scene` as the FIRST constructor param (the scene-first
  signature IS the boundary marker). It goes in the render-frame chain, after the fixed-step loop.

## Wiring (all in `WorldScene`)
1. Class + constructor injection: one dep per line, `private readonly`, empty body. Uniform `update(dt)`
   (or `update()` for stateless per-frame passes) — no `tick()` aliases. Injected services (`Damage`,
   `StrikeResolver`) are NOT stepped.
2. Construct it in `create()`, wiring deps explicitly. Anything holding per-run mutable state is injected,
   never a module singleton (a headless multi-world server must not share worlds).
3. Insert the `.update()` call at the RIGHT point:
   - **Sim:** inside `stepSim()` — current order: doors → input → squads → ai → movement → body-collision →
     ships → melee → abilities → combatant → effects → director. Key dependencies are stated as inline
     comments; state your step's dependency the same way, and keep the comments true when reordering.
   - **Presentation:** in `update()` after the `while (acc >= SIM_DT)` loop (runs once per render frame).
4. Sim never calls presentation: FX via typed events (`events.emit('fx:…')`); HUD state via `publish()` and
   `RegKey` (one write per frame). No events BETWEEN sim systems in the same tick — order stays explicit.
5. Sim randomness only via an injected seeded `Rng` stream; no `Date.now`/`Math.random` in sim code.

## Verify
- Headless Vitest test in `app/test/` (kebab-case): construct the system with stubbed deps (`{} as T` + a
  why-safe comment), drive `update(dt)`, assert the behavior contract (`describe` = "Subject — contract",
  `it` = lowercase behavioral sentence).
- `npm run typecheck` + `npm test` from `app/`. If files moved/renamed, update `docs/ARCHITECTURE.md`'s tree
  in the SAME commit — stale docs are bugs.
