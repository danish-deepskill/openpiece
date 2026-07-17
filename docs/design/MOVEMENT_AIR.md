# Air Movement & Aerial Combat (Design)

> **Stage:** shipped — jump/Geppo built + playtested

Vertical play — **jump → Geppo → aerial combat** — built on a **two-layer** model, not a continuous height.
This doc is the captured design; **not yet implemented.** Build when the air pillar is committed to.

## The core decision: TWO LAYERS, not a height (z) value

An actor is either **grounded** or **airborne** — a discrete state, exactly like the existing
`MoveMode = 'foot' | 'boat'` (`ecs/components.ts`). The new axis is a peer:

```
export type Layer = 'ground' | 'air';   // on the mover, beside `mode`
```

**Why two layers, not continuous z + gravity** (the deliberate rejection, so future-me doesn't "fix" it):
- The destination is **air COMBAT + Geppo** — both are *categorical* ("am I fighting in the air domain or the
  ground domain"), not *continuous* ("how many pixels up am I"). Fighting games — the real reference for
  aerials — model grounded/airborne/juggle as STATES, not a height float.
- It mirrors an idiom already in the sim (`MoveMode` flips collision rules). A `Layer` that flips
  collision + combat-targeting rules is the SAME pattern — no new continuous quantity, no gravity integration.
- The pretty jump ARC is faked purely in PRESENTATION (scale + shadow eased over the air timer); the SIM stays
  a clean boolean. Juicy visual, simple sim.
- **What we give up:** partial-height interactions (fall damage, jump-over-*low*-but-not-*high* walls, degrees
  of airborne). None are on the roadmap. **Upgrade path IF ever needed:** promote `Layer` to a continuous
  `height` number — the layer checks become `height > 0` / height-band checks. Additive, not a rewrite. Do NOT
  pre-build it.

## The airborne state (sim)

On the mover: `layer: Layer` + `airT: number` (seconds of airborne remaining). Grounded is the default
(`layer: 'ground'`, `airT: 0`).

- **Enter air:** an ability sets `layer = 'air'`, `airT = <duration>`.
- **Tick (MovementSystem):** `airT -= dt`; when `airT <= 0` → `layer = 'ground'` (land). Edge-triggered land
  (fire once, on the transition) so a landing FX/AoE/stagger-cancel happens exactly once (EDGE_CASES ★).
- **Determinism:** no gravity RNG; airT is just a timer. Nothing new for the seeded streams.

That is the WHOLE sim foundation. Everything below READS `layer`.

## What the layer changes (the rules that read it)

- **Traversal (collision):** while `layer === 'air'`, `MovementSystem`/collision ignores foot-blocking terrain —
  you pass OVER deep Water and low walls (`FOOT_BLOCKED`). One branch in the collision check: air actors clear
  ground obstacles. This is the "jump over the gap/fence" payoff. (Tall/roofed obstacles could carry a
  `blocksAir` tile flag later if some walls should stop even a jumper — data, not a branch.)
- **Combat targeting:** a hit resolves against actors on a MATCHING layer by default — a grounded swing hits
  grounded targets; an aerial attack hits airborne ones. Cross-layer is EXPLICIT (opt-in on the ability):
  - `hitsAir?: boolean` — a grounded attack that reaches UP (anti-air: a launcher, Rankyaku's flying slash).
  - `hitsGround?: boolean` — an aerial attack that reaches DOWN (a dive/ground-pound; Gomu Ono is the grounded
    cousin — an aerial slam would set this).
  Default (neither set) = same-layer only. This is the ONE new gate in the hit-resolution path
  (`StrikeResolver`/`MeleeSystem`): filter candidates by layer unless the ability opts to cross.
- **AI:** a grounded brain can't reach an airborne target it has no anti-air for → it must reposition, wait for
  the land, or use an air-reaching ability. Falls out of the targeting rule (a can't-hit target isn't engaged);
  a future `ai.antiAir` profile knob decides whether it waits vs. chases with a gap-closer.

## The abilities (data — the Moat)

Jump and Geppo are the SAME family: a granted ability that enters the air state. They differ only in DATA.

- **`ability.jump`** — one ground launch. Enters `air` for a short `airT`; lands. Granted to (nearly) everyone
  as a base-kit verb, like roll/guard. Stamina cost per jump.
- **Geppo (`ability.geppo`, Rokushiki style layer)** — "kick off the air." The SAME air-entry, but it can be
  re-triggered WHILE AIRBORNE, up to `airKicks: N` times, each refreshing `airT` (staying aloft) and draining
  stamina per kick. So the difference is purely: *can I re-launch mid-air, and how many times?*
  - Basic jumper: `airKicks: 0` (only launches from the ground).
  - Geppo: `airKicks: N` + a per-kick stamina drain → sustained hover/flight, bounded by the stamina bar.
  - This is the SAME "capability = a grant" model as sprint/roll/parry. Engine generic; jump vs Geppo = data.
- **Aerial attacks** — normal abilities that happen to be usable while `layer === 'air'` and/or set
  `hitsGround`. A dive-slam = an aerial ability with `hitsGround` + a landing AoE (reuses the Ono/Rocket
  `landRadius` slam path). Rankyaku = a grounded ranged ability with `hitsAir` (a flying air-slash that
  reaches the airborne). No new engine — they're rows that read/set the layer flags.

## Presentation (fake the height — reuse what exists)

The sim is a boolean; the DRAWING sells the arc. Reuse the top-down height convention already used by Gomu Ono
(scale-for-height) and the existing contact shadow (`actorDraws.ts:205,622`):

- **Scale up on an arc:** over the airborne window, the actor scales up then back
  (`scale = 1 + JUMP_SCALE * sin(π · airProgress)`) — bigger = higher = nearer the camera.
- **Shadow shrinks + lightens** with the same arc: the existing contact shadow shrinks/detaches as he rises,
  returns on landing. The shadow is the LOAD-BEARING cue (without it, scaling reads as "zooming at the screen,"
  not "up in the air").
- **Optional squash-and-stretch** on takeoff/landing for punch (like the Ono foot's rise/slam).
- Draw-order: an airborne actor draws ABOVE grounded ones (nearer camera) — same over/under idea the roll and
  the Ono foot already use.

## Composition summary (how it all stacks)

```
Layer state (ground|air)  ← the ONE new sim quantity (a boolean + timer)
  ├─ Traversal  : air ignores foot-blocked terrain (collision reads layer)
  ├─ Combat     : hits filter by matching layer; hitsAir/hitsGround cross it (StrikeResolver reads layer)
  ├─ ability.jump  : ground launch (airKicks 0) — base-kit verb
  ├─ Geppo         : same entry + airKicks N + stamina/kick — a Rokushiki style grant (data)
  └─ Aerials       : abilities usable in air / with hitsGround|hitsAir (dive-slam, Rankyaku) — data rows
Presentation: scale + shrinking shadow eased over the air timer — the arc is faked, the sim stays a boolean.
```

## Build order when the pillar is committed (NOT now)

1. `Layer` + `airT` on the mover; MovementSystem ticks airT with edge-triggered land.
2. `ability.jump` (base kit) enters/exits the state; the scale+shadow presentation.
3. Collision: air clears foot-blocked terrain (the traversal payoff) + a jumpable gap in the test world.
4. Combat: layer-match hit filter + `hitsAir`/`hitsGround` opt-ins.
5. Geppo as a style grant (`airKicks` + stamina drain); aerial attacks as ability rows.

Each step is green-gated (typecheck + Vitest) and mostly DATA once step 1–4 land. Keep this doc and
`ARCHITECTURE_SCALE`/`ROADMAP` in sync when it's built.
