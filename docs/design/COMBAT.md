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
attribute that races/potentials modify like any other stat, plus the EQUIPPED weapon row's drawn length
(`abilityReach()` in `combat/swing` — the hitbox's own geometry, never a number restated on the ability row). Hit
detection then adds the target's radius.

## Combat Potentials
Stat-boosting **"posters"** that tune your build (think equippable passive modifier sets). Pure data:
each potential = a named bundle of **Modifiers** (flat/%/override) applied to your Attributes.

## Power tier
Per-unit tier `-F … SSS+`, derived from attributes + gear + fruit/haki investment. Used for: threat scaling,
bounty, content gates, and "can I even hurt this boss" checks (tier gaps reduce effectiveness).

### The dominance ladder — tier gaps are walls (BUILT 2026-10-09, `combat/dominance.ts`)
The tier curves already own every MAGNITUDE (hp / atk / def / attack speed). The ladder owns the QUALITY of a hit
across a gap and never its arithmetic — a damage multiplier here would double-count the curves (the "+20 % vs
ice" cheapness #16 refuses). One lookup per hit at the one chokepoint (`StrikeResolver.hit`), from a data table of
rungs keyed by the gap in BANDS (3 per letter); the AI needs no code to dominate or be dominated — it experiences
the rungs. Today's rungs sit one letter apart (the coarse default); finer rows land as rows.

| gap | hitting **up** (you are below) | hitting **down** (you are above) |
|---|---|---|
| 3+ (one letter) | he flinches half as much (hitstun, knockback ×0.5); your hits half-rattle his guard | your hits stagger longer (×1.25) |
| 6+ (two letters) | **poise**: no flinch, no shove; posture ×0.25; you **can't clip** his windup or channel | his **blocks rebound you** (a stagger — the counter opening); your parry **only blocks** his blows; his hits crush your guard ×2 |
| 9+ (three letters) | all of the above and **any landed hit rebounds** — you stagger on contact, like striking stone | his heavy breaks your guard outright (×4) |

**Effective tier** = nameplate tier + the `dominance` stat (base 0, `combat/stats`): a coating lifts you for its
duration through the normal modifier pipe — Armament is **+3** (one letter), so a C with haki up clashes as a B.
Conqueror / advanced haki / sea-stone on the victim are more rows, no code. The genius-survival floor holds:
nothing reduces damage — a cornered higher tier still bleeds; skill buys survival, the ladder is why it rarely
buys victory. Not the ladder's job: Logia intangibility (a hard tag rule, countered by a tag) and INT (a separate
axis — a dumb A- is still a wall). Open follow-ups: the AI *knowing* the gap (fodder fleeing a two-letter wall —
"fodder facing a Conqueror simply drops"), and surfacing the rung on the HUD.

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
- **Attributes**: Health, Endurance, Defense, Willpower, Luck, Spiritual (+ derived: power tier, **stamina** with its day's ceiling **vigor**, the haki pool **will** from Spiritual
  (offense gate), **posture** (defense/guard gate), …).
- **Abilities**: cost (stamina/haki), cooldown, cast/active windows, tags, granted by any of the four layers.
- **Effects**: instant (damage), duration (buffs/debuffs/DoT), infinite (passives), CC (Conqueror fear,
  stuns). Stackable, source-tracked.
- **Tags**: `state.logia.intangible`, `haki.armament.active`, `cc.feared`, `fruit.type.zoan`, … drive
  immunities, counters, and conditions (Armament tag lets a hit bypass `state.logia.intangible`).

### Built (ledger — the generic seams the first duel pair landed, 2026-10-09)
Each is DATA on a row + one generic engine rule; none knows the Samurai exists. The Haki layer lands on them.
- **The buff keys** — `utility` on a haki/fruit/style row → `loadout.utilities` in precedence order (C = the loudest
  layer's, X = the next; nothing shadowed), the brain's buff beat walks them on engagement (`ai/brains.tryUtility`,
  one press per beat). A buff = an ability with `grantEffect` + an Effect row of modifiers. Rows: Kiai, the Ronin's
  Kiai, Armament.
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
- **The HAKI layer** (`defs/layers.Hakis`, `equipment.haki`, the fourth `LayerKind`): a row grants its technique
  onto the first buff key (haki > fruit > style — the others keep their own keys) — the engine knows haki only as the tags
  and stats its effects grant. First row: Armament → `effect.armament` (atk ×1.5, HARDENING — `damageTakenMul` ×0.5, read by
  Damage.apply before the flat def: half of every strike reaches a coated body — `dominance` +3, `deflectChance`
  1, the `haki.armament.active` tag). The blade turns black while coated (`draw/coating.ts` — baked, since
  Canvas can't tint). HELD, not timed: `ability.toggle` + `EffectDef.drainStamPerSec` (the Geppo-hover model) —
  switch on (free, needs a second of fuel), pay per second, drops when the bar is empty; the brain lights it on engagement and
  drops it to regroup.
- **Pace** (`ability.pace` — a `cycle` of effects on the Z stance key, granted by `trait.pace`): Second Wind (every
  action half price, the pause after a spend ½, breath ×1.5, the will trickle ×1.25, each spend booked at ×1.5 wear, rest
  recovery ×0.5) →
  Measured Breath (breath ×0.6, wear ×0.3, vigor mends even mid-fight, rest recovery ×1.5) → normal. Five multiplier
  stats carry the trade; the brain picks a mode by stamina + pressure (`pushBelowStam`, `tryPace`).
- **Vigor + Will** (`combat/stamina`, `combat/attributes`): stamina is BORROWED from the day — the price of a spend is
  BOOKED at the spend (the full effort × the pace held then — `vigorDebt`) and PAID as the breath refills, wearing the
  bar's ceiling (vigor); a pace flip after exerting changes nothing already owed. Vigor comes back over minutes once the
  breath is back (one bar: a
  grey vigor bar from the left, stamina inside it, a divider at the ceiling — long fights are won by attrition; the
  skeleton #2's fatigue plugs into); WILL is the haki pool (spiritual × 10 — no base: only trained bodies have one),
  drained by a held coating (`drainWillPerSec`) and spent by techniques (`costWill`). "Has haki" = has will.
- **The magnitude curve** (`combat/PowerTier.TIER_CURVE`): four numbers, flattened once the ladder owned quality —
  per letter hp ×1.56, atk ×1.40, +0.12 attack speed (was ×2.15 / ×2.0 / +0.3: an 8× DPS gap two letters up).
- **The tier-gap ladder** (`combat/dominance.ts`, § Power tier above): one lookup per hit shapes flinch, guard,
  interrupt, parry and rebound by the band gap of EFFECTIVE tiers. Authored in `letters()`; the debug layer
  `combat.rung` prints each hit's verdict (`combat:clash`). First unit built on it: the Ronin (A- — haki is A-+ by rule,
  `defs/units.HAKI_MIN_TIER`, boot-enforced).
- **FX themes from body STATE** (`combat/fxTheme` → `draw/fxThemes`): a coated body's every attack visual — swing
  crescents, the crescents/balls it fires (stamped at fire time), its hit sparks, the blade in its hand — reads as haki
  because the TAG is on the body, never by a flag per ability. A new themed state = one tag row + one palette row.
- **Haki TECHNIQUES** are abilities gated by `requireTags` (Kokutō needs the coating) and may carry `parryShift` —
  bands the wielder counts higher for the parry question ONLY, so "unparryable" is tier-relative: no one at or below
  the wielder's letter turns it, a coated equal's own letter cancels it, a master above still does.
- **Launch cues** (`AbilityDef.launchAt[]`): a swing that carries its own impulses — the Rocket's one, a dash-cut's
  step as the cut goes active. Reach = blade + travel. **Dash strings** (`AbilityDef.dashes`): a flash-step that
  repeats back to back, each step re-aimed at the live direction (Sandan — the Ronin's Q, and the brain's gap-closer
  since it reads the dash slot). **Phasing** (`state.phasing`): a pass-through step's body is as un-solid as an
  airborne one; walls still stop it.
- **Ragdoll** (`AbilityDef.ragdoll`, `combat/ragdoll.ts`) — the knockdown CC class, the top-down answer to launchers:
  FLIGHT (flung on the impulse channel, tumbling as the dodge-roll's ball, phasing; a wall drops it with a thud) →
  DOWNED (a sprawled pose along the fall, seeded limb splay; hittable; PUSHABLE — a walker shoves it along; never
  re-launched) → get-up. The rung scales it like any shove/stun, so a dominant body is never launched. First row:
  Kokutō.
- **AI counter knobs** (`AIProfileDef.parryByWeight`, `punishChance`, boot-validated): a brain that spends its parry
  on committed blows (`combat/phases.swingWeight` — the one weight classifier) and ripostes a stagger with its heavy
  — the INT ladder's "tactical" rung, as data.
- **The pair hold** (`WeaponDef.grip.hold: 'each'`, `visual.offArt`): ONE weapon row that puts a blade in EACH hand
  (nitōryū). The hold is the single fact the rest derives from: the grip anchor is per hand (`draw/actorDraws.weaponAnchor`),
  the sprite system draws one image per occupied hand (the off hand from its own art, both baked for the coating), a
  flurry's cuts ALTERNATE hands under it (`combat/swing.activeSide` — the rule moved from the motion name onto the data;
  the rubber-arm Gatling is the same rule with two fists), the idle blade waits at guard through a cut, the block crosses
  the two. `hitVolume.cutWindows(n, phases)` authors a double cut; each window's hit comes from the hand that cuts it. Not
  built (YAGNI): two equipment slots with any weapon in each — a pair def is the pre-packaged case that could split later.
- **The trail volume + crossCut** (`hitVolume` kind `trail`, `swing.crossCut`, `MeleeSwing.launchX/Y`, `landedAt`): a hit
  volume that is the PATH of a launched step, live only once the step has landed — the dash-through cut that lands on
  everyone he passed, after he is behind them. The motion poses BOTH hands (`SwingPose.off`, `bladeAngle`): blades
  sheathed back through the step, snapped into an X at the landing, the body facing the aim throughout. The FX is the
  line he ran (`fx:swing` type `trail`, themed). First row: Rashōmon (the game version — the manga's is a stationary
  bisecting iai; the dash-through with the delayed cut is the verb players picture, and one the Ronin's kit lacks).
- **The off-blade hit + the Nigiri shapes** (`weaponSegment.hand: 'off'`, `StrikeFrame.off`, `swing.scissorIn/Out`,
  `twinThrust`, `swingFx: 'crossMark'`): a cut with two swords is TWO segments, each a share — centered pays full, clipped
  pays half (precision rewarded, which flat per-hit damage never does). Zoro's LMB chain rebuilt to constraints chosen
  against the median: every step identifiable from a paused frame by the blades alone (closing V · parallel converging
  points · opening V), no two share a hit silhouette, short · short · held, the finisher scores an X on the ground (the
  "sand pattern" — the first trace any move leaves). Swing visuals draw at `strikeRange` (the steel), never `abilityRange`
  (the brain's engage distance, which adds a step's travel — the crescent had been painted where no blade was).
- **The clash** (`combat/clash.ts`, `MeleeSystem.clashes`): STEEL RINGS ONLY BETWEEN HAKI — both blades must be coated
  (`canClash`, one tag constant); plain steel, and a coated blade against a plain one, just trade. Then: two LIVE blade segments overlapping in a
  tick, OR the MUTUAL BLOW: both live blades landing on each other's bodies in the same tick (two cuts arriving together
  meet in the middle instead of trading). Geometry, never a roll: blades either visibly cross or they don't. The verdict is the LADDER (a letter apart,
  coating included → the dominant blade powers through), then WEIGHT (heavy > medium > light), then COMMITMENT (the
  blow further into its cut), and a true tie is the BIND: both swings lost, both staggered the rebound beat, both shoved
  off the contact, both pay posture, one clang. Every outcome reads from the screen. The melee tick became three passes
  (advance · clash · resolve) so both blades are judged on the same tick's geometry. Readout: `combat:clash` bind/overpower.
  THE BLADE LOCK (`MeleeSwing.lock`, `effect.bladeLock` "Bind"): the verdict does not land at once — both HOLD with blades
  crossed (the swing clocks pause, so the poses stay pinned at the crossing; the Bind freezes them like a stun) for the
  hold (bind 0.7s, overpower 0.08s — the hitstop), sparks trickling, then the verdict lands: a BIND stumbles both back; an
  OVERPOWERED loser is FLUNG (the ragdoll along the line away from the contact — losing must look like losing) while the
  winner's cut resumes. Equals are decided by a seeded roll (bind chance, then a win tilted by commitment); the ladder and
  weight never roll.
  Ended by the melee tick, never the effect clock (no race); a ragdoll mid-lock dissolves it with no recoil. The pure
  `endEffect` (combat/Effect) exists for this — the EffectSystem's expiry shares its release path.
- **The flying-slash duel** (`ProjectileSystem.duels`, `Projectile.kind/rung`): shot meets shot — the rung stamped at FIRE
  (like the theme) decides first (a letter apart erases the other shot and flies on), then the CLASS (a slash cuts a ball;
  equals burst each other). A coated 72-Pound erases an uncoated gale; two coated gales meet in a mutual burst. Owners
  must be enemies. The term: FLYING SLASH (tobu zangeki); the crescent is its drawn shape.
- **The tactical rung, as data** (`ai/brains`: `guardChoice`, `sidestep`, `foeOpen`, `situationalPick/Closer`,
  `holdFinisher`; profile knobs `dodgeByWeight`, `guardReads`, `comboIntent`, `readsSituations`; role tags
  `AI_ROLE_GAP_CLOSER/GUARD_BREAK/FINISHER/RANGED`): the one guard roll gained a DODGE (the base roll thrown across the foe's
  line); GUARD READS move shares instead of raising them — never a parry on a blow the ladder says can't be parried
  (the technique's parryShift vs my letter), never a block on a cracked guard; a foe recovering from a WHIFF is an opening
  like a stagger (the riposte); COMBO INTENT holds a chain's finisher after a whiff; SPECIALS FOR A REASON — a role-tagged
  pick before the flat roll (a gap closer whose reach covers the distance, a guard breaker against a raised/cracked guard,
  a finisher under 30%, a ranged poke at a regrouper — or at any far foe at `rangedChance` per decision beat; a
  volley-throwing swing reaches as far as its slashes); a SPECIAL's CHAIN IS CONTINUED (Sai Kuru → Taka Nami: the armed root
  is pressed again, as a hand would). Every rule a knob or a tag; the Samurai, the Ronin and Zoro differ by numbers (the
  Ronin reads and dodges, Zoro presses and throws).
- **The dodge, both sides** (`InputSystem` Shift-tap, `brains.dodgeDirection`, `trait.fleet`): the PLAYER's dodge is the base
  roll on a Shift TAP (a hold is the sprint — the RMB tap-vs-hold precedent): toward the held keys, or a backstep — every
  fighter keeps the roll even when a style owns Q (Zoro's Q is a lunge). The AI picks its dodge DIRECTION off the incoming
  blow's shape: a thrust or a lunge (a line) is stepped OFF sideways; a sweep (its blade AND its wind arcs) is stepped
  BACK out of reach when the roll clears it, else sideways. FLEET (+25% walk/sprint) is a trait on the duelists — speed
  is the one stat a gap in is felt every second, so it stays a per-unit choice, never a tier curve.
- **Pace by danger** (`AIProfileDef.pushBelowHp`): the duelists hold the normal pace until HP ≤ 60%, then push; the
  Samurai keeps the stamina trigger. Either knob is enough; neither is required.
- **Ground hazards** (`AbilityDef.hazard`, `ecs/components.Hazard`, `systems/HazardSystem`): a zone a swing leaves where its
  cut closed — strokes + width + life + a tick clock + a per-body hit cap, ticking through the ONE strike path as the
  owner's hit, drawn by FxSystem FROM the entity (the mark you see is the zone that cuts). First row: Samon's sand pattern
  (×0.35 every 0.5s, three times at most — stand on it and keep paying). A fire patch or an electric puddle is one more spec.
- **Summoners, plural** (`StructureDef.reRing`: refuse | clear | reset, `summonLabel`): the arena's TRAINING POST is a second
  `summon` row — three dummies on the south row, cleared by a second use (dummies never die on their own); the GONG rung
  mid-duel RESETS it (the live pair removed, a fresh pair from the marks). Nothing stands in the ring at world-gen.
- **The pump on the blow** (`stats.KNOCKBACK_STAT`, `SHOT_SCALE_STAT`, `Projectile.scale`): two more multiplier stats — the
  shove every hit of a body lands (after the rung; a ragdoll's fling too) and the size of every projectile it looses (hit
  radius at spawn and drawn size together, stamped on the shot like the theme). Ni Gorilla sets both ×1.35 — a pump you SEE
  on the strike, not only on the health bar. Pure offense: its negligible flat-def share was removed.
- **Two-hand motions + hand auras** (`swing.twinCleave`, `draw/handAuras`): the second both-hands motion — Nigori Zake as
  ONE blow (both blades raised together, held, brought down across the front; one window + a force arc, never a flurry).
  A body-state visual on the FISTS from a TAG (the pump's warm halo), the fxTheme pattern applied to buffs: one row per
  state, the fists keep their true size (a drawn fist is an unarmed hitbox).
- **The duel gong** (`StructureDef.summon`, `verb.summon`, `structures.json`): a SUMMONER structure whose roster (unit +
  tile offset) is data on the def; E spawns them through the one spawn path facing each other and records the ids on the
  instance, refusing to ring while any of them lives. A set-piece fight starts when someone is there to WATCH it and can
  be re-run once it's over — the sim runs the whole world every tick, so a world-gen-placed duel would be over before
  anyone sailed there. (A unit asleep until approached was built and removed the same day: it put the trigger on the
  unit and cost a world scan per sleeper per tick; the gong is one press.) The arena itself is SQUARE — isle, floor and
  ring share one shape metric (`WorldGen.shapeDist`, the isle's `shape` knob).
- **Zoro (Advanced)** (`unit.zoroAdvanced`, A): the second haki unit and the Ronin's duel partner — faction `challengers`
  (hostile to the ronin alone, and the ronin returns it — MUTUAL, so both close on sight; a one-way stance left the master
  standing until the first cut); both are summoned by the gong, neither is placed at world-gen. The provoke rule
  (`StrikeResolver.provokeTerritorial`) is judged from the VICTIM's side since then — the matrix is directional. Nitōryū on the pair: the Nigiri double
  cuts (LMB), Sai Kuru → Taka Nami (RMB; the wave ragdolls), Ushi Bari as his dash (Q), Ni Gorilla (X) gating Nigori Zake
  (1), the 72 Pound flying slashes (2), Rashōmon the coated dash-through iai — the trail cut (3). Same letter as the Ronin: coating cancels
  coating, and the duel is kit against kit — pressure (trades, posture) against precision (phasing steps, reads).

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
