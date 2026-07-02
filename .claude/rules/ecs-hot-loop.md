---
paths:
  - "app/src/systems/**"
  - "app/src/ecs/**"
  - "app/src/ai/**"
  - "app/src/world/**"
  - "app/src/scenes/**"
---
# ECS & hot-loop canon — distilled from `docs/DESIGN_PATTERNS.md` §4–§5, §8, §12 + `docs/ARCHITECTURE.md`

- **In-place mutation IS the style.** Components are mutated directly; presence-as-state (`e.melee = {…}` /
  `delete e.melee`). NEVER "improve" per-frame code toward spread-copies, `Readonly`, map/filter chains, or
  immutable updates — the allocation-free hot path is an explicit design goal. Snapshot-iterate
  (`[...world.with(…)]`) only when the loop body deletes the queried component.
- **No allocation in per-frame loops** where avoidable — no closures on entities, no per-entity array/object
  literals per tick. Alias components at loop top (`const t = e.transform`).
- **Components are plain, serializable data** — no engine objects, no functions, no class instances except the
  blessed primitives (StatBlock, TagSet). Cross-entity refs are ids at rest; object refs are fine within a tick
  but must be re-resolvable.
- **Sim/presentation boundary:** sim systems must be constructible with ZERO Phaser (`test/architecture.test.ts`
  enforces it). Presentation systems take `scene: Phaser.Scene` as the FIRST ctor param — that signature IS the
  boundary marker. Sim never calls presentation: FX via typed events, HUD via `publish()`/`RegKey`.
- **Fixed timestep:** the sim advances in `SIM_DT` quanta (accumulator in `WorldScene.update`); never step sim
  state by raw render delta. Presentation updates once per render frame with raw dt.
- **dt discipline:** decay/smoothing use exp forms (`Math.exp(-k*dt)`, `1 - Math.exp(-dt/tau)`) — never bare
  per-frame `x *= 0.9` or `Math.min(1, k*dt)` on sim state.
- **Determinism:** sim randomness ONLY through injected seeded `Rng` streams (`worldgen`/`ai`/`combat`); no
  `Date.now`/`performance.now` in sim (the master-seed mint in WorldScene is the ONE legal wall-clock read).
  Cosmetic FX jitter stays on `Math.random` BY DESIGN — do not "fix" it onto a sim stream.
- **Order of operations:** mutate → clamp → edge-trigger transition (fire once, on change) → publish. The sim
  order in `stepSim()` is explicit; key dependencies are stated as inline comments — keep them true when
  reordering.
