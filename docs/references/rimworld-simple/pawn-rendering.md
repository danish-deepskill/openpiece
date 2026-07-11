# Pawn rendering & the apparel paperdoll — RimWorld vs ballpiece (adopt/skip verdicts)

> Companion to `adoption-tiers.md`. The atlas (00–19) and that tier list cover *systems* (AI, effects,
> stats, save/load) — NOT rendering. This doc fills that gap: how RimWorld composites a pawn, how ballpiece
> does it, and — honestly, not defensively — where RimWorld is genuinely better and we should adopt it.
> Verified against the decompiled source (`Verse/Graphic_Multi.cs`, `Verse/ApparelLayerDef.cs`) and XML
> (`Core/Defs/Misc/ApparelLayerDefs/ApparelLayerDefs.xml`), 2026-07.

## Both are layered paperdolls (the shared shape)

A pawn is NOT one image — it's a base body with cosmetics **composited by draw-order**. Identical idea in both:

| | RimWorld | Ballpiece |
|---|---|---|
| base | body texture (per BodyType) | procedural `drawActor` body (`draw/actorDraws.ts`) |
| cosmetics | apparel + hair + head, stacked | `AccessoryDef` sprites per slot (`systems/AccessorySystem.ts`) |
| ordering | `ApparelLayerDef.drawOrder` (int) | `SLOT_DEPTH` record (float rungs) |
| substrate | textures (`Graphic_Multi`) | `Visual` union: auto / procedural / sprite (`defs/visual.ts`) |

## RimWorld's apparel layer ladder (real `drawOrder`, bottom→top)

```
OnSkin    0    shirts (against the body)
Middle  100    flak vest / armor over the shirt
Shell   200    duster / parka — the outer coat
Belt    300    utility (ammo/tool belts)
Overhead 400   hats, helmets
EyeCover 500   goggles, masks
```

Ballpiece's ladder (`AccessorySystem.SLOT_DEPTH`): `back(.35) → chest(.45) → face(.5) → hair(.55) → head(.6)`.
Same concept — **but ballpiece has ONE torso slot (`chest`) where RimWorld has THREE stackable (OnSkin/Middle/Shell).**

---

## Adopt / skip — honest verdicts (not "we already have it")

### 🔨 ADOPT — split the torso into stackable layers (OnSkin / Middle / Shell)
**RimWorld is genuinely better here and ballpiece should adopt it.** One `chest` slot can't show a shirt
peeking under armor under a coat — real layered clothing. It's also how clothing *actually* reads. The change
is small and canon-clean: add torso slot values (`shirt`/`armor`/`coat` or keep RimWorld's names) + their
depth rungs, same pattern as the `hair` slot addition. **Trigger:** the moment a second torso garment exists
(the first character with a shirt AND a coat, or armor over clothes). Until then one `chest` slot is fine —
but don't pretend it's equivalent; it's a deliberate not-yet.

### 🔨 ADOPT (with the split) — `drawOrder` as a data int on the layer, not a hardcoded record
RimWorld's `drawOrder` lives on the (data) `ApparelLayerDef`; ballpiece's `SLOT_DEPTH` is a hardcoded engine
`Record<AccessorySlot, number>`. The data-int approach lets new layers slot in by DATA (content adds a layer
without editing the engine map) — which fits ballpiece's content-is-data canon *better than the current code
does*. Adopt the integer-drawOrder shape when doing the torso split above.

### 🌱 DEFER — per-item `drawData` offsets (fine position/scale nudge per apparel piece)
RimWorld lets each graphic carry its own offset/scale tweak. Ballpiece is ~80% there already (`offset` +
`scale` on `AccessoryDef`). Close the last gap only if per-item fitting gets fiddly across many assets.

### 🌱 DEFER — `ApparelLayerDef` as its own Def
Making each layer a first-class Def (vs ballpiece's `AccessorySlot` string-union) is marginally cleaner but
only pays off once layers proliferate. The union is fine at current scale.

### ❌ SKIP — directional textures (`_north` / `_east` / `_south`, `Graphic_Multi`)
**The one place ballpiece is genuinely better for its choice** (not defensiveness). RimWorld authors 3–4
textures per body AND per apparel piece, one per facing (west = mirrored east), because its camera is a
tilted 3/4 side view where a south-facing pawn differs from a north-facing one. Ballpiece is **true top-down**:
ONE sprite, rotated to the aim. That's **4× less art per item** and no per-facing authoring. The cost is a
flatter look (no faces — the head is a blank disc; see the portrait discussion). For a top-down game that
trade is correct — keep the single-view model.

---

## Texture size / scale (for authoring)

- **RimWorld:** resolution-independent (Unity orthographic, zoomable). 1 cell = 1 world unit
  (`GraphicData.drawSize = Vector2.one`). Textures authored ~128px/cell; the camera scales them to any zoom.
- **Ballpiece:** fixed `TILE = 32px`, fixed 1280×720 camera (`Scale.FIT`). Body `r = 11px` → unit ~24px tall
  (¾ tile), head ~16px (½ tile). Apparel authored ~256px, drawn at ~24px. **If ballpiece ever adds zoom**,
  RimWorld's "author high-res, scale at draw" is the model to move toward — the `Visual` sprite `scale` field
  already leans that way.

## The through-line
RimWorld **validates** ballpiece's layered-slot paperdoll — it's the same architecture. The honest deltas:
adopt the **split torso layers + data drawOrder** (RimWorld richer, and more canon-aligned than our current
hardcoded record); keep our **single top-down sprite** (genuinely better for a top-down game). See
`docs/art/README.md` (authoring frames) and `AccessorySystem` (the compositor).
