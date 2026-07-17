# Generating consistent openpiece character references (ChatGPT / image models)

These are **top-down character reference portraits** in openpiece's own render style — the view you get
looking straight DOWN at a unit standing still, facing the camera (south). They are art references, NOT
in-game sprites. The engine draws units procedurally (`app/src/draw/actorDraws.ts`); these images are the
"what should this character look like" target that art + procedural tuning aim at.

The whole trick to CONSISTENCY: an image model can't follow numbers ("head at 0.72r"). It follows a
**reference image + a plain-language body-part legend + a locked style**. Give it all three, every time.

---

## The 3 things to paste into ChatGPT, every single time

### 1. Attach ONE base image
Always attach the SAME existing reference (e.g. `luffy.png`) as the visual anchor, and say:
> "Match the exact top-down layout, camera angle, proportions, background colour, and outline style of this
> reference image. Only change the character's identity (hat, hair, clothing colours, skin, gear)."

That single attached image carries all the geometry the words can't. This is 80% of consistency.

### 2. Paste the BODY-PART LEGEND (below)
So the model knows what each shape IS and where it sits.

### 3. Paste the STYLE LOCK (below)
The rules that must never drift between characters.

---

## THE BODY-PART LEGEND (top-down, unit facing DOWN / toward viewer)

Read the base image with this. Back-to-front (what's drawn first is most hidden):

| Part | What you see | Where it sits | Colour |
|---|---|---|---|
| **Head** | the **big skin-tone circle** — the single most prominent shape, dead center | offset slightly **UP** (away from facing) so it crowns the figure | skin tone (`#e0a070` default) |
| **Face** | there is **NO face by default** — the head is a blank disc; a hat usually covers its top | on the head, slightly toward the viewer (down) | — |
| **Hat / headgear** | sits ON TOP of the head, covering its upper half (e.g. Luffy's straw hat) | crowns the head | character-specific |
| **Torso** | a **dark crescent peeking out BELOW the head** (the head hides most of it) | just below + behind the head | clothing colour (vest/coat) |
| **Shoulders** | **two vertical slabs flanking the head** left & right — the widest points | ±sideways from the head | clothing colour (match torso) |
| **Hands / fists** | **two skin circles at the far left & right edges**, behind the shoulders, only their outer half peeks out | resting at the sides | skin tone |
| **Arms / sleeves** | short clothing-colour connectors from each shoulder down to each hand | shoulder → hand | clothing colour |
| **Shadow** | a soft flat ellipse directly under the whole figure (pure top-down "sun overhead") | dead center, under everything | translucent black |

**Plain-language summary to hand the model:**
> Top-down view. A big skin-coloured head circle dominates the center, topped by the character's hat. A
> crescent of their upper-body clothing peeks out below the head. Two clothing-coloured shoulder slabs flank
> the head left and right. Two skin-coloured hands rest at the far left and right edges behind the shoulders.
> A soft shadow sits under the whole figure. No facial features — the head is a clean disc under the hat.

---

## THE STYLE LOCK (never drift these)

- **View:** strict top-down (bird's-eye), unit facing the viewer (south). NOT front-view, NOT 3/4, NOT isometric.
- **Background:** flat olive green `#2e3630`. Nothing else in frame — no scene, no props, no ground texture.
- **Outline:** every shape has a chunky charcoal outline `#4d4a45` (near-black). Uniform weight.
- **Fills:** FLAT colour, **max ~2 values per material** (a base + one shade). No gradients, no soft shading,
  no rendering/painterly detail, no highlights beyond a flat shade.
- **Shapes:** chunky, simple, geometric — circles and ellipses. This is a clean vector/flat-icon look, not
  illustration.
- **Proportion:** the head is huge relative to the body (it's the top-down foreshortening) — do not shrink it.
- **Framing:** figure centered, occupying the middle ~40–50% of a **square** canvas, generous margin.
- **Identity lives in:** hat, hair colour peeking out, clothing colours, skin tone, and any signature gear —
  NOT in a face. Keep faces absent unless you deliberately decide otherwise for a hero close-up.

---

## Copy-paste prompt template

> Generate a top-down character reference in the attached image's exact style — flat vector, chunky charcoal
> outlines (#4d4a45), flat olive-green background (#2e3630), bird's-eye view of a unit standing and facing
> the viewer. Match the attached reference's layout and proportions exactly; only change the character.
>
> Layout (do not change): a large skin-coloured HEAD circle dominates the center, topped by the character's
> HAT. Their upper-body CLOTHING peeks out as a crescent below the head. Two clothing-coloured SHOULDER slabs
> flank the head left and right. Two skin-coloured HANDS rest at the far left and right edges. Soft shadow
> under the figure. No facial features.
>
> Character to draw: **[NAME]** — [hat/headgear], [hair colour], [clothing colours + signature garment],
> [skin tone], [any signature gear e.g. sword, scar, tattoo visible from above].
>
> Flat fills, max 2 values per colour, no gradients, no shading beyond one flat shade. Square canvas.

---

## Consistency checklist (glance before saving a new one)

- [ ] Same olive-green background as the others
- [ ] Same top-down angle (head crowning the figure, shoulders flanking, hands at the edges)
- [ ] Charcoal outline on every shape, same weight
- [ ] Flat fills only — no gradients or soft shading crept in
- [ ] Head is big and blank (face absent), hat sits on top
- [ ] Square canvas, figure centered with margin

> If a generation drifts (adds a face, goes 3/4-view, adds a background scene, softens the fills), don't
> tweak wording endlessly — re-attach the base image and say "match this reference's style and angle exactly."
> The image is a stronger anchor than any sentence.
