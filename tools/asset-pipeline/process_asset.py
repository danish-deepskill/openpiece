#!/usr/bin/env python3
"""
process_asset.py — turn raw AI-generated art PNGs into a CONSISTENT set of game-ready openpiece sprites.

The AI (ChatGPT / DALL-E / Scenario / ...) draws the ART, but a batch of AI art is inconsistent: off-center,
different sizes, wobbly outline widths, drifting palettes. This script fixes ALL the mechanical
inconsistencies deterministically, so a pile of uneven AI art collapses onto one uniform set:

  ALIGN (always):
    1. cut background       — flat color-key (default) or --rembg ML cutter
    2. trim to content      — kill the framing the AI chose
    3. center + resize      — every asset centered on a square canvas at one size   -> POSITION consistent
    4. head cutout          — (chest/body slots) punch the transparent head hole
  NORMALIZE (--normalize, on by default; disable with --no-normalize):
    5. palette snap         — remap every pixel to the nearest color in palette.json -> COLOR drift GONE
    6. uniform outline      — strip the AI's outline, re-stroke a fixed-width charcoal edge on the alpha
                              silhouette                                              -> OUTLINE WIDTH uniform

Output matches the form of the existing hand-made sprites (app/src/art/.../straw_hat.png: 256x256,
transparent, centered) so it drops onto the slot anchor by construction.

Background-removal modes:
  * color-key (DEFAULT): flood-fill inward from the corners. Instant, Pillow-only. Best when you generated
    on a FLAT known background (recommended in the prompt: pure white, the game olive #2e3630, or a lurid
    magenta #ff00ff that never appears in the art).
  * --rembg: an ML remover (downloads a ~170MB model on first run). Only for busy/fuzzy edges the color-key
    can't separate. Requires `pip install rembg onnxruntime`.

USAGE
  python process_asset.py raw/my_hat.png                     # -> out/my_hat.png (aligned + normalized)
  python process_asset.py raw/*.png                          # batch a whole folder
  python process_asset.py raw/coat.png --slot chest          # punch a transparent HEAD CUTOUT
  python process_asset.py raw/fine.png --no-outline          # keep the AI outline (delicate interior linework)
  python process_asset.py raw/x.png --no-normalize           # align only (no palette/outline changes)
  python process_asset.py raw/x.png --outline-width 5        # thicker uniform outline (default 4 @ 256)
  python process_asset.py raw/fuzzy.png --rembg              # ML cutter for hard edges

Then drop the output into app/src/art/<hats|accessories|weapon>/ and point a def at it. See README.md.
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter
    import numpy as np
except ImportError:
    sys.exit("Pillow + numpy are required.  Run:  pip install -r requirements.txt")


# --- openpiece style constants (kept in sync with docs/art/README.md by hand) -------------------------
DEFAULT_SIZE = 256          # existing sprites are 256x256 (straw_hat.png); the engine sizes uniformly anyway
DEFAULT_MARGIN = 0.06       # fraction of canvas left as empty border after centering (breathing room)
# HEAD CUTOUT geometry (for 'body'/'chest' frame sprites), DERIVED from the render (actorDraws.ts):
#   body frame spans +/-BODY_FRAME_R*r = +/-1.5r, so 1 unit of r = SIZE/3 px.
#   head diameter = 2*headR*r = 2*0.72*(SIZE/3) = 0.48*SIZE.  (matches docs/art/apparel-template.svg)
#   head sits at -headBack*r = -0.12r along the aim; "away from facing" on a facing-UP canvas is DOWN (+y),
#   so the cutout is offset DOWN by 0.12*(SIZE/3) = 0.04*SIZE from center. (The earlier UP shift was wrong.)
HEAD_CUTOUT_DIAM_FRAC = 0.48
HEAD_CUTOUT_DOWN_FRAC = 0.04   # of the FULL canvas, shifted down (head is offset away-from-facing = toward viewer)


def color_key(img: Image.Image, tol: int) -> Image.Image:
    """Make background transparent by flood-filling inward from every corner, removing pixels within `tol`
    (per-channel) of the sampled corner color. Only removes background CONNECTED to an edge — an olive hat
    band in the middle survives even if it matches the olive background. This is the safe, fast default."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    # background color = the most common corner (robust if one corner clips the art)
    bg = max(set(px[c][:3] for c in corners), key=lambda col: sum(px[c][:3] == col for c in corners))

    def near(c: tuple[int, int, int]) -> bool:
        return all(abs(c[i] - bg[i]) <= tol for i in range(3))

    # BFS flood-fill from the edges so interior pixels matching bg (a hatband) are NOT erased
    seen = bytearray(w * h)
    stack = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] \
        + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        idx = y * w + x
        if seen[idx]:
            continue
        seen[idx] = 1
        r, g, b, a = px[x, y]
        if not near((r, g, b)):
            continue
        px[x, y] = (r, g, b, 0)  # transparent
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return img


def rembg_key(img: Image.Image) -> Image.Image:
    """ML background removal (heavy; downloads a model on first run). For fuzzy edges only."""
    try:
        from rembg import remove  # type: ignore
    except ImportError:
        sys.exit("--rembg needs the rembg package.  Run:  pip install rembg onnxruntime")
    return remove(img.convert("RGBA"))


def trim_to_content(img: Image.Image) -> Image.Image:
    """Crop to the non-transparent bounding box."""
    bbox = img.getbbox()  # bbox of non-zero (here: non-transparent) region
    if bbox is None:
        sys.exit("ERROR: image is fully transparent after background removal — try a higher --tol, a "
                 "cleaner background color in the AI prompt, or --rembg.")
    return img.crop(bbox)


def center_square(img: Image.Image, size: int, margin: float) -> Image.Image:
    """Fit the trimmed art into a transparent square canvas, centered, longest side scaled to (1-2*margin)."""
    target = int(size * (1 - 2 * margin))
    w, h = img.size
    scale = target / max(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((size - img.width) // 2, (size - img.height) // 2))
    return canvas


def _hex(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def load_palette(path: Path) -> tuple[np.ndarray, tuple[int, int, int]]:
    """Load palette.json -> (Nx3 array of allowed colors, the outline color). The outline color is included
    in the snap set so re-stroked edges also land on-palette."""
    data = json.loads(path.read_text())
    outline = _hex(data.get("outline", "#4d4a45"))
    cols = [_hex(v) for k, v in data.get("colors", {}).items()]
    if outline not in cols:
        cols.append(outline)
    return np.array(cols, dtype=np.int16), outline


def palette_snap(img: Image.Image, palette: np.ndarray) -> Image.Image:
    """Remap every visible pixel to its NEAREST palette color (Euclidean in RGB). Kills palette drift: every
    slightly-different red across a batch becomes the ONE locked red. Transparent pixels are left alone."""
    arr = np.asarray(img.convert("RGBA"), dtype=np.int16)
    rgb = arr[..., :3]
    alpha = arr[..., 3]
    flat = rgb.reshape(-1, 3)                                   # (P,3)
    # nearest palette entry per pixel: argmin over squared distance to each palette color
    dists = ((flat[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)  # (P,N)
    nearest = palette[dists.argmin(axis=1)]                     # (P,3)
    out = nearest.reshape(rgb.shape).astype(np.uint8)
    result = np.dstack([out, alpha.astype(np.uint8)])
    return Image.fromarray(result, "RGBA")


def uniform_outline(img: Image.Image, width: int, outline_rgb: tuple[int, int, int], erode: int) -> Image.Image:
    """Replace the AI's wobbly outline with a FIXED-width one. Method: take the alpha silhouette, optionally
    ERODE it a touch to eat the AI's own dark rim, then DILATE by `width` to make an outline ring, fill that
    ring with the charcoal color, and composite the (eroded) art on top. Result: every asset in a batch has a
    pixel-identical border regardless of what the AI drew. Tuned for FLAT chunky art (openpiece's style)."""
    img = img.convert("RGBA")
    alpha = img.getchannel("A")
    # binarize the silhouette (anti-aliased edges -> hard mask so the ring is crisp)
    mask = alpha.point(lambda a: 255 if a > 128 else 0)
    # eat the AI's existing dark rim so the new outline replaces it instead of stacking on it
    core = mask.filter(ImageFilter.MinFilter(2 * erode + 1)) if erode > 0 else mask
    # the outline ring = dilate(core) minus core
    grown = core.filter(ImageFilter.MaxFilter(2 * width + 1))
    ring = Image.fromarray(np.clip(np.asarray(grown, np.int16) - np.asarray(core, np.int16), 0, 255).astype(np.uint8))
    # build: transparent canvas -> paint outline where ring -> paste the art (masked to core) on top
    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))
    outline_layer = Image.new("RGBA", img.size, (*outline_rgb, 255))
    canvas = Image.composite(outline_layer, canvas, ring)
    art = Image.composite(img, Image.new("RGBA", img.size, (0, 0, 0, 0)), core)
    canvas.alpha_composite(art)
    return canvas


def punch_head_cutout(img: Image.Image) -> Image.Image:
    """For chest/body-frame sprites: erase a transparent HEAD-shaped hole so the head renders through it
    (docs/art/README.md: 'chest sprites need a transparent head cutout'). Positioned from the template."""
    from PIL import ImageDraw
    size = img.width
    d = int(size * HEAD_CUTOUT_DIAM_FRAC)
    cx = size // 2
    cy = size // 2 + int(size * HEAD_CUTOUT_DOWN_FRAC)  # shifted DOWN (head offset away-from-facing = toward viewer)
    mask = Image.new("L", img.size, 255)
    ImageDraw.Draw(mask).ellipse([cx - d // 2, cy - d // 2, cx + d // 2, cy + d // 2], fill=0)
    out = img.copy()
    out.putalpha(Image.composite(img.getchannel("A"), Image.new("L", img.size, 0), mask))
    return out


def process(src: Path, out_dir: Path, args, palette: np.ndarray, outline_rgb: tuple[int, int, int]) -> Path:
    img = Image.open(src)
    img = rembg_key(img) if args.rembg else color_key(img, args.tol)
    img = trim_to_content(img)
    img = center_square(img, args.size, args.margin)
    # NORMALIZE (color + outline) — done AFTER centering so the outline ring is sized in final pixels.
    # NORMALIZE is OPT-IN and only safe on FLAT, few-color art whose colors ARE in palette.json. On detailed
    # illustration both steps HURT (palette-snap washes missing colors to wrong neighbors; the outline restroke
    # muddies interior linework) — verified by eye on the character refs. Align (above) is always safe; these
    # two are for processing true flat game-assets (hats/weapons) once palette.json holds their colors.
    if args.palette_snap:
        img = palette_snap(img, palette)
    if args.outline:
        width = args.outline_width if args.outline_width else max(2, round(args.size / 64))
        img = uniform_outline(img, width, outline_rgb, args.erode)
        if args.palette_snap:
            img = palette_snap(img, palette)  # re-snap: alpha-composite can introduce edge blends
    if args.slot in ("chest", "body"):
        img = punch_head_cutout(img)
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / (src.stem + ".png")
    img.save(dst)
    return dst


def main() -> None:
    ap = argparse.ArgumentParser(description="Turn raw AI art into a game-ready openpiece sprite.")
    ap.add_argument("inputs", nargs="+", help="raw PNG(s) or a glob (e.g. raw/*.png)")
    ap.add_argument("--out", default="out", help="output folder (default: ./out)")
    ap.add_argument("--size", type=int, default=DEFAULT_SIZE, help=f"square output size (default {DEFAULT_SIZE})")
    ap.add_argument("--margin", type=float, default=DEFAULT_MARGIN, help="empty border fraction (default 0.06)")
    ap.add_argument("--tol", type=int, default=30, help="color-key tolerance per channel (default 30)")
    ap.add_argument("--rembg", action="store_true", help="use ML background removal (fuzzy edges only)")
    ap.add_argument("--slot", default="head", choices=["head", "face", "back", "chest", "body", "weapon"],
                    help="slot; 'chest'/'body' punches a head cutout (default head)")
    ap.add_argument("--palette-snap", action="store_true", help="remap colors to palette.json (opt-in: only "
                    "safe on FLAT art whose colors ARE in the palette; washes detailed art)")
    ap.add_argument("--outline", action="store_true", help="re-stroke a UNIFORM-width charcoal outline "
                    "(opt-in: great on FLAT chunky art like hats/weapons, muddies DETAILED illustration)")
    ap.add_argument("--normalize", dest="_norm", action="store_true",
                    help="shorthand for --palette-snap --outline (flat game-assets only)")
    ap.add_argument("--outline-width", type=int, default=0, help="uniform outline width px (0 = auto: size/64)")
    ap.add_argument("--erode", type=int, default=1, help="px to shrink the silhouette before re-stroking, to "
                    "eat the AI's own rim (default 1; raise if a double outline shows)")
    ap.add_argument("--palette", default=str(Path(__file__).parent / "palette.json"),
                    help="palette JSON to snap colors to (default: ./palette.json)")
    args = ap.parse_args()
    if args._norm:  # --normalize is shorthand for both normalization steps
        args.palette_snap = True
        args.outline = True

    files: list[Path] = []
    for pattern in args.inputs:
        files.extend(Path(p) for p in glob.glob(pattern))
    if not files:
        sys.exit("No input files matched.")

    palette, outline_rgb = load_palette(Path(args.palette))

    out_dir = Path(args.out)
    for f in files:
        dst = process(f, out_dir, args, palette, outline_rgb)
        tags = [f"{args.size}px", "transparent", "centered"]
        if args.palette_snap:
            tags.append("palette-snapped")
        if args.outline:
            tags.append("uniform-outline")
        if args.slot in ("chest", "body"):
            tags.append("head-cutout")
        print(f"  {f}  ->  {dst}  ({', '.join(tags)})")
    print(f"\nDone. Drop the output into app/src/art/ and point a def at it (see README.md).")


if __name__ == "__main__":
    main()
