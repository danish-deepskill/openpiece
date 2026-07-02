---
paths:
  - "app/src/defs/**"
  - "app/src/combat/**"
---
# Content-is-data canon — distilled from `docs/DESIGN_PATTERNS.md` §0, §6 and `docs/ARCHITECTURE_SCALE.md` §10

- **A new thing = a new Def row, never a new branch.** `if (id === 'fruit.gomu')` anywhere is a bug — behavior
  comes from the def's fields/abilities/modifiers/tags, not engine branches.
- **Def file pattern** (canonical small example: `defs/accessories.ts` — per-row rationale comments included):
  one family per `defs/` file — a JSDoc'd
  `XDef extends Def` interface + `export const Xs = new Registry<XDef>('Xs', validator?)` (singleton is PLURAL)
  + `registerAll` rows, each with a rationale comment. Function-bearing strategy rows (`MOTIONS`, `Verbs`,
  `draws`) live beside their engine, not in `defs/`.
- **Id grammar:** `<family, full-word, singular>.<camelCaseSlug>` — `ability.gomuPistol`, `accessory.strawHat`,
  `unit.hero`. MACHINE-ENFORCED: `core/Registry.register()` throws on any id violating
  `/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/`; a family's optional `Validator` adds numeric-range checks on top
  (see `Abilities` in `combat/Ability.ts`).
- **`parent` inheritance:** child fields WIN; arrays/objects are REPLACED, not deep-merged — restate a list to
  change it. Chains resolve lazily and fail LOUD (duplicate id, unknown parent, cycle → throw at boot).
- **Fail loud at boot:** numeric ranges get a boot `Validator`; content errors crash at load, never surface
  mid-game. Log any silent cap/truncation (spawn limits, loot caps) — never fail silently.
- **Lookup at point of use** (`Abilities.get(m.ability)`) — never cache def objects on entities;
  serialize-by-ID is the norm (`bb.profile` is the one documented hot-path cache exception).
- **Knobs live on defs, not in code** — per-unit AI on `AIProfileDef`, per-ability combat on `AbilityDef`.
  Every field JSDoc'd with unit + behavioral consequence ("reaction: aim-lag (s): it commits to where you
  WERE"). Inline tuning literals only for one-engine geometry, and then as named local consts.
- **Stats only via `combat/StatBlock` + `combat/Modifier`** (flat → addPct → mulPct → override, source-tracked;
  unequip = `removeBySource`). No stat math scattered in systems.
- **Every content family gets a registry-sweep test** in `app/test/` — every referenced id resolves.
