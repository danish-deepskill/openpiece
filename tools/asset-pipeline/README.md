# Asset pipeline — AI art → consistent game-ready ballpiece sprites

**The problem:** AI (ChatGPT/DALL·E/…) draws good art, but a *batch* of it is inconsistent — off-center,
different sizes, on a background, wobbly outline widths, drifting colors. **The fix:** the AI makes the ART;
this script fixes the mechanical INCONSISTENCIES deterministically, so a pile of uneven AI art collapses onto
one uniform, aligned, transparent set that drops onto the unit's slot anchors by construction.

> **Scope (tested):** these tools are for **flat, chunky, few-color in-game assets** (hats, weapons,
> accessories — the kind of art in `app/src/art/`). They are NOT for detailed illustration (the character
> refs in `docs/references/characters/` are illustrations — align works on them, but `--outline`/`--palette-snap`
> muddy them). Prompt the AI for FLAT art and these work great.

## Setup (one time)

```bash
pip install -r requirements.txt        # Pillow + numpy  (rembg optional, see requirements.txt)
```

## The workflow

1. **Generate art in ChatGPT** using the prompt below. Flat top-down, plain background, no soft shading.
2. **Save the raw PNG(s)** into `tools/asset-pipeline/raw/` (make the folder).
3. **Run the script** (from `tools/asset-pipeline/`):
   ```bash
   python process_asset.py raw/*.png --outline        # align + uniform outline (the usual call)
   ```
   Output lands in `out/` — every asset centered, transparent, 256×256, uniform outline.
4. **Drop the output** into `app/src/art/hats/` (or `accessories/`, `weapon/`).
5. **Register a def** — one row in `app/src/defs/accessories.ts` (hats/accessories) or `defs/layers.ts`
   (weapons). Boot fails LOUD if the file's missing, so if the game starts, it's wired:
   ```ts
   { id: 'accessory.myHat', name: 'My Hat', slot: 'head',
     visual: { kind: 'sprite', art: 'hats/my_hat.png', scale: 1.6 } },
   ```

## What each step does (and when to use it)

| Step | Flag | Always safe? | What it fixes |
|---|---|---|---|
| **Align** (bg-cut + trim + center + resize) | *(always on)* | ✅ yes, any art | position, size, framing, background/transparency |
| **Uniform outline** | `--outline` | flat art only | different outline widths → one fixed charcoal edge |
| **Palette snap** | `--palette-snap` | flat art + full palette | color drift → snapped to `palette.json` |
| **Both** | `--normalize` | flat art only | shorthand for `--palette-snap --outline` |
| **Head cutout** | `--slot chest` | chest/body sprites | punches the transparent head hole (README §chest) |

**Rule of thumb:** `--outline` for hats/weapons (flat, chunky). Add `--palette-snap` only after you've put
that asset family's colors into `palette.json`. Leave both off to just align.

### Background removal
- **Default: flat color-key** — flood-fills from the corners. Prompt the AI for a plain background (pure
  white, the game olive `#2e3630`, or lurid magenta `#ff00ff`). Tune with `--tol N` (default 30) if it
  leaves a halo (raise) or eats the art (lower).
- **`--rembg`** — ML remover for busy/fuzzy edges only. Heavy; see `requirements.txt`.

## The ChatGPT prompt (flat art, so the pipeline works)

> Top-down (bird's-eye) view of a single [HAT / WEAPON / ACCESSORY] for a game, centered on a **plain solid
> white background**, no shadow. Flat vector style: chunky charcoal outline (#4d4a45), flat fills, **max 2
> values per color**, no gradients, no soft shading, no rendered detail. Chunky simple shapes. Just the item,
> nothing else in frame.
>
> Item: **[describe it — e.g. "a marine officer's peaked cap, navy blue with a gold band"]**.

(For a *character*'s look to copy, also attach a `docs/references/characters/*.png` and say "match this
style," but still ask for the single item on a plain background.)

## palette.json

The locked color set `--palette-snap` remaps to. Ships with the engine colors; **add your asset family's
colors** (a hat's specific blues/golds) before snapping that family, or the snap will wash them to wrong
neighbors. The `outline` key is the color used by `--outline`.

## Tuning cheats

- Double outline after `--outline`? raise `--erode 2` (eats more of the AI's own rim first).
- Outline too thin/thick? `--outline-width 5` (default auto = size/64).
- Different output size? `--size 512` (engine sizes uniformly, but bigger = crisper source).
- More breathing room? `--margin 0.1`.

## Alignment reference

Fit is guaranteed because the output form matches the hand-made sprites (`app/src/art/.../straw_hat.png`:
square, transparent, centered) and the engine anchors sprites via the slot system. For the full authoring
contract (frames, head cutout, layer order) see `docs/art/README.md` and the generated `docs/art/unit-template.svg`.
