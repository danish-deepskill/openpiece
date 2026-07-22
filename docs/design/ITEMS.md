# Items & Inventory — the substrate (Design)

> **Stage:** designed — commons+instance two-tier model; judged 2026-07-18 (pass #21). Evidence is
> PARTIAL (research run killed mid-pipeline; salvaged) — no decision rests on the unverified angles
> (reviewer-checked), but re-running them may sharpen §ownership/§containers.

**Scope.** Judges backlog #21: the item substrate half a dozen passes assume — the commons/instance
boundary, the quantity model, containers, ownership & theft, degradation. Consumes
`docs/research/ITEMS_RESEARCH_PARTIAL.md` (salvaged run, killed mid-pipeline — labels honest there). **Risk class: architecture →
design-first** (METHOD §4): the def/instance split and the transfer discipline are make-once-pay-forever;
no feel is at risk here. Deliberately OUT: loot-table content (#4/#10), shop/price logic (#7), the witness
model (#6 owns it), equipment-slot EXPANSION (armor-with-stats etc. — #4's call), charges' combat behavior
(#19). The commons tier (ItemRef spine, pickup/bag/equip) is already built and is confirmed canon, not
re-opened.

## The verdict

The spectrum, from shipped precedent:

```
pure fungible ──────────── two-tier hybrid ──────────────── everything-instance
(OSRS: id+count only;      (commons by default;              (EVE: every item a DB row
 state = id families)       instance by exception)            in a location tree)
        │                         ▲                                  │
   REJECTED: state           OPENPIECE                          REJECTED: bloat +
   laundered into ids,                                          allocation + determinism
   no provenance ever                                           cost for zero need
```

**Openpiece items are two-tier: COMMONS by default, INSTANCE by exception.** A common item is
`{cat, id}` + a count — perfectly fungible, no history, cheap as an integer (this tier is built). An item
becomes an **instance** — a real entity — if and only if it carries per-item state. The boundary is a
one-line law:

> **The boundary law: state ⇒ instance.** Grade, condition, charges, a vessel's fruit, a custom name, a
> stolen mark, provenance — any per-item fact promotes the item to an entity. No state, no entity.

This is the convergent shape of the canonical precedent (RimWorld's optional comps on Things —
[VERIFIED] against the local decomp; Minecraft's 1.20.5 id+count+optional-components rework corroborates
as [LORE], as does EVE's cautionary pole) and it is canon-native: Definition-vs-Instance, ids-at-rest,
no allocation for the common case. Rejected tiers recorded above; also rejected: OSRS's id-family state
encoding (a def per charge level — combinatorial ids, state laundered into identity) and per-item flags
on commons (Skyrim's stolen-flag laundering class).

## Core model — five pieces

### 1. The stack (commons quantity)

`ItemStack = { ref: ItemRef, n: number }`. Containers hold stacks, not bare refs (`Inventory.items`
migrates `ItemRef[]` → `ItemStack[]`; existing single items are `n: 1`).

- **`stackLimit` on the def** (per-def data, never a global — OSRS evidence): default **1**
  (non-stackable); starting numbers: materials **50**, provisions **20**, ammo **30**, coin/berry
  **1,000,000**.
- **Merge rule:** stacks merge iff same `{cat, id}` — and instances NEVER merge (the verified RimWorld
  relic rule). Overflow **clamps and logs loud** ("Truncating" — the RimWorld/OSRS-agreed rule); wrap is
  forbidden.
- Activates the `'material'` category `items.ts` already reserves.

### 2. The instance (tracked items as entities)

An instanced item is a world entity with one component:

```
ItemInstance {
  of: ItemRef;                 // what it is an instance OF (def resolves everything generic)
  condition?: number;          // 0..1 wear (instances only — commons never wear)
  grade?: ContentId;           // weapon grade row (ungraded…supreme) — #4's ladder
  copyQuality?: ContentId;     // artificial-fruit maker grade — #4's vessel/copy leans
  vessel?: ContentId;          // the fruit a fruit-vessel holds (#4: the object IS the eater)
  name?: string;               // a NAMED item ("Yoru-like") — display + news identity
  marks?: { stolenFrom: EntityId; since: number }[]; // evidence ON the thing (bounded, ≤4)
  log?: ProvEvent[];           // provenance ring buffer, cap 8 (forged-by, graded-by, taken-at…)
}
```

- Location: `containedBy?: EntityId` (in a container) or a `transform` (lying in the world). One or the
  other, never both — that invariant IS the anti-dupe shape (an instance exists in exactly one place).
- **Grants resolve from defs, never from instances.** An instance grants what its `of` def grants
  (WeaponDef `primary/heavy/slots`, the built equipment-kit path), plus its `vessel` fruit's kit when
  equipped. Instances carry HISTORY; defs carry BEHAVIOR — a named blade with a unique move is its own
  def row (rarity `mythical`, the world yields one instance of it), never a per-instance ability list.
  This keeps ids-at-rest and kills a whole serialization/balance surface (per-instance movesets:
  rejected).
- **World tracking for `mythical`/`divine` instances** — in SEAMLESS_WORLD's own vocabulary (no row, no
  second representation — its dehydrate verdict): a `relic` GC-retention reason (a tracked instance is
  never collected) plus a queryable index of entity ids the news/director read (#6/#8). That is all
  "world-tracked singleton" means mechanically. *Flagged dependency:* SEAMLESS_WORLD's stage line is
  itself gates-unpassed — if its ledger verdict moves, this bullet follows it, nothing else here does.
- **Conservation of relics:** `mythical`+ instances are never destroyed by timers, decay, or despawn —
  only deliberate acts move or unmake them. (The fruit-rebirth promise generalized; a tracked singleton
  lost to a cleanup timer is a corrupted world.)
- **Promotion is a one-way door:** a rare act (grading by an appraiser, engraving, feeding a fruit to a
  vessel) converts one unit of a common stack into a fresh instance. Demotion doesn't exist.

### 3. The container (one relation for every "inside")

One component, everywhere something holds something:

`Hold { stacks: ItemStack[]; slots: number }` — instances point in via `containedBy`.

- Body bag (`UnitDef.bagSlots`, default **10**, fauna **0**), corpse (the dead unit's own hold — loot is
  reading it, no transfer-on-death event), chest, market stall, warehouse, and SHIP HOLDS (per-hull
  `ShipDef.holdSlots`: rowboat **6**, sloop **24**, caravel **60** — provisioning pressure is hull data)
  are all this one shape. The RimWorld `IThingHolder` lesson: containment is an interface, not five
  features. **`Inventory` does not survive slice 3:** the bag BECOMES the body's `Hold` (same accessor
  path, one component renamed-and-widened) — two container shapes coexisting would be this section's own
  lesson violated.
- `Pickup` (built) stays as the lightweight ground form for commons, gaining a count (`n`, one-field
  migration); an instance on the ground is just the entity with a transform.
- Slots count **stacks**, not units — capacity × stackLimit is the real volume knob (the quartermaster's
  arithmetic).

### 4. The transfer discipline (the dupe defense)

All item mutation flows through ONE service (`Items`, the `Damage`-pattern): give/take/stow/drop/equip/
consume/split/merge are its verbs, executed **atomically within a sim tick**, clamped at the single
mutation site.

- The research's one root cause — non-atomic, timing-dependent transfer — is made structurally
  impossible in-sim: one mutation site, fixed-timestep, deterministic order.
- **Multiplayer stance (stated now, built later):** the server validates every transfer against the
  authoritative container state; no client-supplied item payloads, ever (the 2003 partyhat lesson —
  the client names an INTENT, the server resolves it against what is actually there).
- Instances are additionally dupe-proof by identity: one entity id, one location field, and ledger
  membership for `mythical`+ makes any duplicate DETECTABLE, not just unlikely.

### 5. Ownership & theft (the two-tier crime model)

Ownership lives on the **container**, not on common items: `Hold.owner?: EntityId | FactionId`
(the stall is the merchant's; the warehouse is the Marines'; an unowned beach crate is salvage).

- **Commons: the crime is the ACT.** Taking from an owned hold without standing = a theft event at that
  moment — witnessed or not is #6's model (this pass only emits the event). The goods themselves stay
  unmarked: fungible loot is untraceable BY DESIGN (the [SOURCED] no-provenance finding) — that is what
  makes the underworld's fencing of commons boring-safe and honest.
- **Instances: the evidence is the THING.** Theft appends a `marks` entry (and a `log` event) — a stolen
  named blade is hot forever, recognizable by anyone who knows it (knowledge economy: #9 decides who
  knows). Selling it to a legit shop is an event; a fence shrugs.
- Rejected: per-item stolen flags on commons (Skyrim's laundering exploit class + it contradicts
  fungibility); ownership per common item (nothing to hang it on once stacks merge).

## Emergent behaviors — deliberately NO dedicated code

- **Fencing economics** — stolen grain launders itself (fungibility), stolen relics never do: the
  underworld's two-speed market falls out of the two tiers, no fencing system needed yet.
- **Fruit-vessel theft = fruit-power transfer without a death** (#4's lean) — `vessel` on an instance +
  ordinary theft verbs. No bespoke mechanic.
- **Quartermaster play** — hold slots × stackLimits vs a voyage's provisions IS the provisioning game
  (#2) before any needs system exists.
- **Loot-a-body** (#3's enemy behavior) — corpses have holds; looting is reading a container. One verb.
- **"The blade surfaced in Loguetown"** — ledger membership + news (#6/#8) makes relic movement a story
  the world tells without item code knowing.
- **Dupe detectability** — ledger + single-location invariant means an audit can PROVE item conservation
  (a determinism-replay test can assert it).

## Sub-mechanics judged, with build-after triggers

- **Charges on instances** (`charges` field): reserved now, behavior when **#19 ranged** builds
  (wet-powder etc. stays #16/#19).
- **Litter decay:** world-dropped COMMONS despawn after **3 game-days** (`LITTER_DECAY_DAYS` in
  `config/constants.ts` — a world rule, not content; deterministic timer, logged; never instances —
  conservation law). Build with the first stacked-loot content. The `marks` (≤4) and `log` (8) ring caps
  are engine invariants, named consts in the `Items` service, not content knobs.
- **Warehouses/banking:** the `Hold` shape at a port building; build when **#7 economy** wants storage.
- **Appraisal** (identifying grade/copy-quality/real-vs-copy): the HOOK is `ItemInstance` fields being
  knowledge-gated at display time — the mechanic itself is **#9's pass** (explicitly deferred).
- **Degradation:** `condition` exists from slice 2, but nothing MOVES it until a pass wants it (#4 for
  weapons? #11 for parts?) — "does gear wear?" is deliberately left to the consuming pass; the substrate
  just gives wear a place to live. Floor rule if adopted: condition never destroys `mythical`+.
- **Weight/encumbrance:** REJECTED for now (slots × stackLimit is enough pressure; weight adds sim cost
  and UI burden without a design need naming it). Re-open only if a pass demonstrates the need.

## Skill/knowledge mapping

No skill bands of its own (a substrate). Two knowledge hooks it exposes for #9: appraisal (what an
instance's hidden fields ARE — grade, copy quality, real-vs-copy) and recognition (whether THIS relic is
known/stolen — "the plate shows what your character knows" applied to items).

## Architecture mapping

- **Defs:** `rarity` field (the 7-step ladder, #4) + optional `stackLimit` on item-bearing defs; both
  validated at boot (rarity ∈ ladder; stackLimit ≥ 1). Def files: `layers.ts` (weapons/fruits),
  `accessories.ts`, `manuals.ts`, + new `materials.ts` when the first material row lands. (The backlog
  lean's "an `ItemDef` family" is resolved BY this shape, deliberately: the built ItemRef spine over
  per-family registries stays — `items.ts`'s own don't-flatten-into-a-mega-table comment is the reason —
  and `materials.ts` is the only new family.)
- **Components:** `Inventory.items: ItemStack[]` (migration: wrap existing refs, n=1); new
  `ItemInstance`, `Hold`, `containedBy` — all plain serializable data, ids at rest.
- **Service:** `Items` (sim, Phaser-free, injected like `Damage`) — the single mutation site.
- **Systems:** none added to the tick. Litter decay rides an existing sweep when built.
- **Determinism:** all mutations in-tick via the service; timers on the sim clock; no wall time.
  Replay-safe by construction; the conservation audit is a testable invariant
  (`item-conservation.test.ts`: run N ticks, assert every instance has exactly one location and ledger
  matches).
- **Multiplayer:** intent-in, server-resolves (stated in piece 4); nothing here reads client state.
- **Presentation:** HUD reads labels (`itemName`/`equippedLabels` pattern, built); instance display
  names/marks surface through the same label helpers.

## The AI-can-play-it check

Every verb is actor-generic already (pickup/equip flow through the same components — the Moat holds).
Traders move stacks between holds with the same service; looters read corpses' holds; a thief's take
emits the same theft event a player's does; INT gates the CHOICES (fence vs shop, which hold to rob),
never the access. A low-INT brigand who steals a marked relic and sells it in port IS the counterparty
the bounty system wants. Nothing here is player-only.

## Build order (triggers, not dates)

1. **Slice 1 — stacks:** `ItemStack` + `stackLimit` + the `Items` service + materials family; pickup and
   bag stack correctly (pick up 30 powder → one stack). *Trigger: before #1 crew builds provisions —
   the queue's reason this pass ran first.*
2. **Slice 2 — instances:** `ItemInstance` + `containedBy` + promotion (first graded blade drop);
   conservation test lands with it. *Trigger: first content that needs per-item state (a graded weapon
   or the first fruit vessel).*
3. **Slice 3 — holds:** unify bag/corpse/chest/ship-hold on `Hold`; loot-a-body falls out. *Trigger:
   ship cargo or corpse looting, whichever content lands first.*
4. **Slice 4 — ownership + theft events:** `Hold.owner` + the theft event + instance marks. *Trigger:
   with #6's heat pass (it consumes the event).*
5. **Ledger registration for `mythical`+** rides the seamless-world ledger work. *Trigger: #14 build, or
   the first mythical instance placed — whichever first.*

## Hard questions — answered

- **Commons/tracked boundary?** The boundary law: state ⇒ instance; `mythical`+ additionally
  ledger-registered. (Rarity correlates with instancing but STATE is the criterion.)
- **Ownership & theft semantics?** Owner-on-the-container; crime-on-the-act for commons (event → #6),
  evidence-on-the-thing for instances. Stolen commons launder; stolen relics never do.
- **Degradation/upkeep?** Substrate provides `condition` on instances only; whether anything moves it is
  the consuming pass's call. Commons are consumed, never worn. Relics never die of neglect.
- **Equipment-slot scope?** Unchanged this pass (weapon/fruit/style/potentials + accessory body slots,
  built) — expansion is #4's call when armor-with-stats or trinkets get designed.
- **Container model?** One `Hold` relation for bag/corpse/chest/stall/warehouse/ship-hold; slots count
  stacks; capacity is per-hull data on `ShipDef`.

## The moat walk (test ×8)

1 systemic ✓ (fencing/quartermaster/loot emerge from the model, §emergent) · 2 knowledge ✓ (appraisal +
recognition hooks exposed for #9) · 3 counterplay ✓ (marked relics vs fences; fungible loot as the
thief's honest option) · 4 world-doesn't-wait ✓ (AI trades/steals/loots on the same verbs; ledger items
move via world events) · 5 costs real ✓ (slots × stackLimit pressure; relic fame is a cost) · 6 engines ✓
(one Hold relation + one Items service + one boundary law multiply every existing def family) ·
7 no-bosses n-a · 8 original-cast n-a (and respected: named items here are this world's own).
