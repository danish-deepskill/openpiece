---
paths:
  - "app/src/**/*.ts"
  - "app/test/**/*.ts"
---
# TypeScript canon — distilled from `docs/DESIGN_PATTERNS.md` §2–§3, §10

- **Forbidden:** `any`, `as any`, `@ts-ignore`, string index signatures on domain types. Use `unknown` + safe
  narrowing for untyped input; generics when a value's type depends on the caller.
- **Casts (`as`) only at:** (a) generic-machinery limits (World/Registry/EventBus internals — comment the TS
  issue), (b) engine boundaries (Phaser's untyped APIs). A cast inside sim logic is a smell — fix the type.
- **Non-null policy:** components proven by a `world.with(…)` query are narrowed by the query's generic type —
  alias at loop top. Everywhere else `?.` + `??`. A bare `!` requires a comment naming who guarantees it.
- **Explicit param + return types on exported functions** and public class methods; let obvious locals infer.
- **`interface` for object shapes; `type` for unions/intersections/mapped types.** Prefer string-literal
  unions over `enum`. Ids move toward template-literal types (`` type AbilityId = `ability.${string}` ``).
- **`import type` for type-only imports** — mandatory across the sim/presentation boundary. In sim folders
  (`ai/ combat/ core/ defs/ ecs/ world/`) NO `phaser` import at all — runtime OR type-only
  (`test/architecture.test.ts` bans both, so sim data can't grow engine-typed fields; its allowlist covers
  only presentation systems).
- **Naming:** Defs end in `Def`; Registry singletons are plural (`Abilities`, `Units`); component interfaces
  are bare nouns; fields camelCase (`maxHp`, never `maxhp`); `*System` = stepped in the tick, no suffix =
  injected service (`Damage`, `StrikeResolver`); never shadow imported names; `fx/fy` is reserved for the FX
  system, never vector components.
- **Files:** PascalCase when the primary export is a class/type of that name; lowercase for multi-export
  modules; tests kebab-case (`body-collision.test.ts`). NO case-only renames (Windows).
- **Comments say WHY, not what — and name the rejected alternative.** CAPS for the load-bearing word.
