# Wearable sprite authoring (artist spec)

**Templates** (both GENERATED from the game's live anatomy constants — never hand-edit; regenerate if body
proportions change; what the template shows IS what the game draws):
- `unit-template.svg` — `npm run art:template` — the full mannequin + every slot anchor. General authoring.
- `apparel-template.svg` — `npm run art:apparel` — focused guide for a CHEST/apparel sprite: the garment
  zone (draw here) + the bright HEAD CUTOUT (leave transparent). Use this when making shirts/vests/armor/coats.

## The two authoring frames

Every wearable is **one square PNG, transparent background, forward = UP**. A def picks its frame:

| Frame | Canvas means | Use for | Def |
|---|---|---|---|
| **`body`** | the WHOLE template sheet: canvas center = body center, canvas edge = ±1.5·r | chest armor (torso+shoulders in one piece), capes, anything spanning the body | `visual: { kind: 'sprite', art: '…', scale: 1, frame: 'body' }` |
| **`item`** (default) | just the item, centered on its SLOT anchor (the yellow crosshairs); display size = `scale` × the slot's basis — **head/face: the HEAD diameter** (scale 1.6 = 1.6 heads), other slots: the body diameter | hats, masks, small back items | `visual: { kind: 'sprite', art: '…', scale: 1.6 }` |

**`body`-frame workflow:** duplicate the template canvas (512px or any square multiple), draw the armor
exactly where it sits over the mannequin, hide the template layers, export. Alignment in game is exact by
construction — no offsets, no math.

## Rules that keep sprites composing with the procedural bodies

- **Style grammar:** charcoal outline `#4d4a45` (~2px at 512 canvas per 342px body… match the template's
  line weight visually), flat fills, max ~2 values per material, no gradients. Chunky shapes — units render
  ~24px tall in game; detail that thin will vanish.
- **Chest sprites need a transparent HEAD CUTOUT** at the head circle (the head renders *above* the chest
  layer and must show through). Trace the template's head.
- **Hands are dashed on the template because they animate** — never bake hands/weapons into a wearable.
- **The red dashed ring is the collision circle (the real hitbox).** Art may overhang it slightly
  (shoulders do, ~1.12r) but the silhouette must not lie badly about where hits land.
- **Square canvas always** — the engine sizes sprites uniformly; a non-square canvas gets distorted.
- Layer order in game (bottom→top): body → back → chest → face → **hair** → head(hat) — a hat always
  covers hair, hair covers the bare head. `hair` is an `item`-frame slot pinned on the head (like a hat);
  draw hair on the head circle, transparent elsewhere. Wear hair + a hat together (distinct slots).

## Adding the finished sprite

Drop the PNG under `app/src/art/`, then register/point a def at it (`defs/accessories.ts`). A missing file
or bad def fails loudly at boot — if the game starts, your art is wired.
