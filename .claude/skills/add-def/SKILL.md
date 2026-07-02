---
name: add-def
description: Add a content def (unit, ability, accessory, AI profile, faction, ship…) or a whole new content family to a Registry. Use when adding game content — a new enemy, weapon, hat, brain profile — or creating a new defs/ file.
argument-hint: "[family + name, e.g. 'unit: marine grunt']"
---

Content is data (CLAUDE.md; `docs/DESIGN_PATTERNS.md` §6). Adding content = adding a data row, never editing
a system. If you find yourself writing `if (id === '…')` in an engine, stop — the behavior belongs on the def.

## Add a row to an existing family
1. Open the family file in `app/src/defs/`. (Function-bearing strategy rows — `MOTIONS`, `Verbs`, `draws` —
   live beside their engine in `combat/`/`draw/` instead; data-only rows live in `defs/`.)
2. Follow the house pattern (canonical small example: `app/src/defs/accessories.ts` — note the per-row
   rationale comments):
   - Id grammar `<family, singular>.<camelCaseSlug>` — `unit.marineGrunt`, `ability.gomuPistol`. Machine-
     enforced: `Registry.register()` throws at boot on a non-conforming id; a family's optional numeric
     `Validator` runs on top.
   - Every row gets a rationale comment — why this row exists / what it demonstrates.
   - Variants: `parent` inheritance — child fields WIN, arrays are REPLACED (restate a list to change it).
     Shared defaults via `BASE`-spread.
   - Cross-family references are plain ids (`ContentId`), resolved at point of use — never cache def objects
     on entities.
3. New behavior knob needed? Add a JSDoc'd field to the `XDef` interface (unit + behavioral consequence,
   e.g. "reaction: aim-lag (s): it commits to where you WERE") — knobs live on defs, not in code.
4. If the field has a legal numeric range, extend the family's boot `Validator` — content errors must crash
   at load, never surface mid-game.

## Create a new content family
1. New file `app/src/defs/<family>.ts`: JSDoc'd `XDef extends Def` interface +
   `export const Xs = new Registry<XDef>('Xs', validator?)` (singleton PLURAL) + `registerAll([...])`.
2. Systems consume it generically — iterate or `get()` the registry; no hardcoded content lists anywhere.
3. Add a registry-sweep test in `app/test/` (kebab-case filename): every def's referenced ids resolve.
   The sweep pattern is in `app/test/unified-combat.test.ts` (iterate `Units.all()`, assert
   `Abilities.has(u.attackAbility)` for every unit). `registry.test.ts` tests the Registry MACHINERY
   (inheritance/validation semantics), not a content sweep — don't copy that shape for content.

## Verify (from `app/`)
`npm run typecheck` and `npm test` — the sweep test is what catches dangling cross-references.
