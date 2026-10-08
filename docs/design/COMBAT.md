# Combat (Design)

> **Stage:** designed — stamina/posture/parry direction (ledger)

Combat is the moat. Your identity comes from **four layers** stacked on a shared attribute/ability engine,
tuned by Combat Potentials and expressed through skill (movement, timing, mode switching).

> Architecture: all four layers are **content** that grant **Abilities** + passive **Modifiers** into one
> GAS-lite engine (Attributes + Abilities + Effects + Tags). See `ARCHITECTURE_SCALE.md §Combat`.

## The four layers (combat identity)
1. **Devil Fruit** — elemental or beast powers. Types: **Paramecia / Zoan / Logia**. Each fruit = a moveset
   (a set of Abilities) + passives + lore. Logia intangibility, Zoan transformations, Paramecia gimmicks.
2. **Haki** — **Armament** (damage/defense, can strike Logia & bypass intangibility — *counters fruits*),
   **Observation** (dodge/aim assist, telegraph reads), **Conqueror** (AoE fear / CC). Later: **advanced**
   variants (e.g. ryuo/future-sight tiers). Haki is the rock-paper-scissors answer to Devil Fruits.
3. **Weapon class** — **Light / Medium / Heavy / Ranged**. Defines base attack style, startup/recovery,
   stamina cost, reach. Weapons come in **sets** with stats; upgradable (~20 tiers, weaker weapons get more
   upgrades) and **enchantable** (blacksmithing).
4. **Fighting style** — techniques & bonuses layered on the weapon (e.g. **Flash Dash**, **Geppo**). Provide
   movement tools and combo extensions.

## Reach (body + weapon)
Melee **reach = the unit's body `reach` attribute (race/build) + the weapon's length bonus**; ranged
abilities are a fixed range. So the same fist reaches equally for any human, a bigger body (or a long-limbed
race like Fishman/giant) reaches further, and a sword adds its length on top — all data-driven via a `reach`
attribute that races/potentials modify like any other stat (`abilityRange()` in `combat/Ability`). Hit
detection then adds the target's radius.

## Combat Potentials
Stat-boosting **"posters"** that tune your build (think equippable passive modifier sets). Pure data:
each potential = a named bundle of **Modifiers** (flat/%/override) applied to your Attributes.

## Power tier
Per-unit tier `-F … SSS+`, derived from attributes + gear + fruit/haki investment. Used for: threat scaling,
bounty, content gates, and "can I even hurt this boss" checks (tier gaps reduce effectiveness).

## Core combat mechanics
- **Flash Dash** (base kit, all classes): burst in any direction through attack-startup frames.
  **Directional i-frame rule:** left/right dashes grant i-frames; front/back do not. Identical on land & ship.
- **Mode switching:** swap the active ability set mid-fight (e.g. weapon-forward ↔ defensive stance) without
  pausing. Fully rebindable keys, including ability activations.
- **Damage multiplier hit-spots:** yellow → orange → red escalating damage zones (taught by Cargo Ship event;
  applies to ships and likely bosses).
- **Cross-class abilities:** active/passive abilities slot into finite **loadout slots** regardless of class
  (a Swordsman can run a Gunner mobility ability). Core attack style/primary weapon stays class-bound.

## Resources — two complementary bars (stamina + posture)
Two separate `Combatant` bars gate the two sides of a fight; they compose cleanly and don't interfere.

- **Stamina — the OFFENSE gate (Dark Souls / Elden Ring lineage).** *Depletes* when you act (attack / dodge /
  sprint) and regenerates when idle, with a **regen-delay** that pauses after any spend — so it only refills out
  of combat and you can't spam. **Shipped.** *(This is Souls-style. **Deepwoken has no stamina bar** — don't
  mis-source it; its defensive resource is Posture, below.)*
- **Posture — the DEFENSE / guard gate (Sekiro / Deepwoken lineage).** Works *inversely*: it **builds up** as you
  block or get pressured, and when it overflows you **guard-break** (staggered + open). Landing hits pressures the
  opponent's posture; a well-timed **parry** dumps yours and spikes theirs. **To build** (a sibling derived
  resource next to stamina).

Together: Souls-style resource management on offense + Sekiro/Deepwoken guard-break dueling on defense.

## Skill-expression cluster (the moat's ceiling — Deepwoken/Sekiro lineage)
The depth that separates "deep" from "spammy" (see `REFERENCES.md` S#2, A#8, A#14, B#20):
- **Parry / block / feint triangle** — a timed **parry** cancels an attack; a held **block** braces but builds
  posture toward a break; **feints** (fake windups) are the mind-game. Best feints have no rhythm.
- **Telegraphed / perilous attacks** — a colored glyph + sound dictates the *required* counter (parry / dodge /
  reposition). Makes deep combat **readable**, not memorized — and it reads *better* top-down (whole scene visible).
- **Anti-infinite-combo** — a flourish/combo-ender launches after N hits, so no perma-stunlock.
- **Elemental status effects** — chilled / burning / shocked / winded / dazed / anti-heal — the debuff layer the
  four combat layers grant via Effects + Tags.

**2D top-down feasibility:** all of the above is *timing + resources + reads* (view-independent) or *positional*
(top-down 360° movement excels at spacing/flanking/backstab). The one real adaptation is the **vertical layer** —
map aerials/uppercuts/jump-over telegraphs to **ground-plane states** (knockdown/ragdoll; dodge/reposition prompts).

## Bosses
> **⚠ Contradicted (2026-07-18) by moat test #7 — NO BOSSES:** scripted boss encounters and guaranteed
> first-kill ability drops are refused. What survives: **mesh-form giants** (event-emergent from War
> events, playing by engine rules), and "where you test the full build" re-sources to high-tier
> CHARACTERS met in the world (an Admiral is an "Admiral fight" via tier bands + Haki + INT, no script).
> Ability rewards re-source per PROGRESSION.md's same-dated contradiction note.

Where you test the full build. Each boss has a unique ability drop (first kill guaranteed). **Mesh-form
bosses** (multiple enemies combine into a giant) emerge in War events.

## Engine implications (preview)
- **Attributes**: Health, Endurance, Defense, Willpower, Luck, Spiritual (+ derived: power tier, **stamina**
  (offense gate), **posture** (defense/guard gate), …).
- **Abilities**: cost (stamina/haki), cooldown, cast/active windows, tags, granted by any of the four layers.
- **Effects**: instant (damage), duration (buffs/debuffs/DoT), infinite (passives), CC (Conqueror fear,
  stuns). Stackable, source-tracked.
- **Tags**: `state.logia.intangible`, `haki.armament.active`, `cc.feared`, `fruit.type.zoan`, … drive
  immunities, counters, and conditions (Armament tag lets a hit bypass `state.logia.intangible`).

### Built (ledger — the generic seams the first duel pair landed, 2026-10-09)
Each is DATA on a row + one generic engine rule; none knows the Samurai exists. The Haki layer lands on them.
- **The C-slot buff** — `utility` on a style/fruit row → `loadout.utility`; the player's C, the brain's buff beat
  on engagement (`ai/brains.tryUtility`). A buff = an ability with `grantEffect` + an Effect row of modifiers.
  First row: Kiai (haste + attack + attack speed + halved combo recovery). Armament is the next customer.
- **Named stats in one home** (`combat/stats.ts`): `moveSpeedMul`, `deflectChance`, `comboRecoveryMul`, the
  attack-mobility and swim stats; multiplier stats seeded 1 at spawn and filled on restore.
- **Attack speed scales the SWING**, not just the cooldown (`combat/phases.swingDuration`): tell-floored
  (`TELL_FLOOR`) so high tiers stay parryable; never slows below the authored time (`SWING_SPEED_FLOOR`).
- **Channels** (`AbilityDef.channel`): planted feet AND interruptible through the whole swing — a long
  commitment bought with a short tell is breakable. A freeze (`state.stunned`) ends ANY swing.
- **Flurries** (`pattern: 'flurry'`): N alternating sweeps timed to authored windows (`combat/hitVolume.flurryWindows`
  from a plan string); the cut count is the windows (`swing.flurryCuts`), boot-validated to tile the active phase.
- **Volleys** (`AbilityDef.volleys`): shot rows loosed mid-swing at progress cues, forward ± spread.
- **Per-volume damage** (`HitVolume.damageMul`): a finisher's crescent can hit harder than the blade's edge.
- **Projectile deflect**: the `deflectChance` stat returns a ball at its shooter (the shukuchi window); a raised
  guard GLANCES it off at `BLOCK_DEFLECT_CHANCE` within `±BLOCK_DEFLECT_ARC` of the facing (`combat/guard`).
- **Body-mounted accessories** (`AccessoryDef.follows: 'body'`): ride the torso's swing twist
  (`draw/actorDraws.bodyDrawAngle`); hats face the cursor. First procedural looks: the kasa and the sode.

## Architecture decision — everything is an Ability; "fundamental" = which grant list

Two ORTHOGONAL questions people conflate (settled 2026-07):

1. **Structure — is it an Ability?** = a row in the `Abilities` registry with a cost/cooldown/trigger/effect.
   The base kit is MADE of abilities: `punch`, `kick`, `dodge` are all `AbilityDef` rows. So are (structurally)
   **block and parry** — parry has a cooldown + tap window, block is a held state. They ARE abilities.
2. **Distribution — fundamental or content?** = whose grant list is it on. **Fundamental** = granted to
   (almost) everyone by default — the universal combat grammar: move, sprint, dodge, basic attack, **block,
   **parry, feint, stamina, posture. **Content** = a *distinguishing* grant most units lack: Devil Fruit
   powers, Haki, fighting styles (Black Leg/Rokushiki), weapon-specific combos.

These are independent: `ability.dodge` is BOTH an ability AND fundamental. Being an ability doesn't make
something "content" — the base kit is abilities everyone is granted. **The test for a NEW mechanic:**
near-universal + units-vary-by-SKILL ⇒ fundamental (goes in `BASE_KIT`); distinguishing + vary-by-HAVING-IT
⇒ content (granted by a layer). Guard is Deepwoken-universal → fundamental; units differ in *how well* they
guard (stats/attributes + AI policy), not *whether* they can. The rare non-guarder is a NEGATIVE exception
(`state.disarmed`, an arm-less beast body), never a missing positive grant.

### Ability `trigger` (input shape is DATA, not a category)
An ability carries HOW it's invoked — `tap` (punch, parry, light attack), `hold` (block, sprint, charge),
`combo` (the sword's 3-hit chain), `charge` (hold-to-charge → release). Block and parry are NOT different
categories: both are guard abilities differing only by `trigger` (block = hold, parry = tap). The InputSystem
reads `trigger` and wires the control generically; the AI reads it to know "hold this up" vs "fire once".

### Planned refactor — promote block/parry to base-kit abilities (NOT yet built)
Today block/parry are HARDCODED into `Combatant` (`blocking`/`parryT`/`parryCd`) + `InputSystem` + a bespoke
`combat/guard.ts` — the odd ones out vs the "one combat engine, everything is Abilities" canon. The target:
- `ability.block` (`trigger: hold`) + `ability.parry` (`trigger: tap`, cooldown) as registry rows in `BASE_KIT`
  alongside `punch`/`kick`/`dodge`, granted to every combatant.
- The `Combatant.blocking`/`parryT` fields become the RUNTIME STATE those abilities drive (like `melee` is the
  runtime state a swing ability drives) — not bespoke hardcoded flags.
- `InputSystem` wires F via the ability's `trigger` (hold), the same generic path Q→dodge uses.
- AI `blockChance`/`parryChance` stay as POLICY (how often it activates an ability it HAS).
- Guard SKILL (window size, success, posture) moves toward ATTRIBUTE-derived (willpower/technique) so it scales
  per-unit and per-tier like everything else, instead of a flat profile chance.
Do this as a standalone piece on a clean (committed) base — it's foundational surgery, well-shaped but meaty.

## Weapon hitbox ↔ visual — the "what you see is what hits" architecture

### The problem (and why patching it fails)
Today a weapon's hitbox and its sprite are both driven by ONE number — `visual.length` (plus `width`). The sprite
renderer (`WeaponSpriteSystem`) scales the art so "canvas-edge → grip = length", and the hitbox
(`swingGeomOf.weaponLen`) uses the same `length` for a straight `weaponSegment` from hand→tip. This works ONLY
for a **rigid straight blade** drawn tip-at-canvas-edge. It breaks two ways:
- **Sprite drift:** a hand-drawn PNG has transparent margins + a grip/pommel, so the VISIBLE blade never equals
  `length` — the hitbox out-reaches the drawn steel (the dagger bug). One number can't be both "hitbox reach"
  AND "the scale that makes the visible blade reach that far" — that depends on the PNG's internal layout the
  code can't see.
- **Non-straight weapons:** a **scythe** (curved crescent offset from the shaft), **kusarigama** (sickle on a
  chain — variable length, two damage zones), **nunchaku** (flailing end on a flexible link) have hitboxes that
  are NOT a hand→tip line. `length`+`width` has no vocabulary for them.

The lesson: **the dagger bug and the scythe are the SAME problem** — a single straight `length` cannot describe
an arbitrary weapon's hitbox. Smarter length fudging (bladeFrac, artScale) is a straight-blade-only band-aid and
an architectural dead end. Don't build it as the solution.

### The target architecture (build when exotic weapons land)
1. **Hitbox = a composition of `HitVolume`s** (ALREADY EXISTS — `combat/hitVolume`: `weaponSegment` straight,
   `arc` crescent — the sword slash-wave; extend the union with shapes + PHASE-DRIVEN positions for chains/flails).
   This is the hitbox AUTHORITY. A scythe's crescent is an `arc` volume today; a nunchaku's whipping end is a
   segment whose position is driven by swing phase (the Gomu stretch arm + `follow:'swing'` already do this — the
   machinery exists, it needs generalizing).
2. **Sprite authored to MATCH its volumes** via the **authoring-frame pattern** — the SAME solution the codebase
   already uses for accessories (`BODY_FRAME_R`, `frame:'body'`, `docs/art/unit-template.svg`): the weapon art is
   drawn on a known canvas where its hit volumes are ALSO defined, so the curved scythe blade sits exactly on its
   arc volume BY CONSTRUCTION, not by a length number. `length`/`width` stop being the universal descriptor —
   they're just the straight-blade convenience case of the general volume system.

So "what you see is what hits" holds for ANY shape because the drawn *blade* (not the whole art, not a length
guess) coincides with the hit volume by authoring, the way the drawn fist already IS the punch hitbox.

### What's built NOW (the straight-blade stopgap)
Straight blades (dagger/cutlass/sword) work via `length`/`width` + optional `hitVolumes[{from}]` to carve off the
grip (the sword's dead zone; the dagger's blade-only `from:0.45`). This is a STOPGAP for rigid straight weapons —
it does NOT generalize. The dagger is tuned so its hitbox roughly matches its sprite; getting it pixel-exact is a
symptom of the missing authoring frame, not worth chasing with more length fudges. Build the volume-authoring
foundation above when the first non-straight weapon (scythe/kusarigama/nunchaku) is actually added.
