# Devlog Q&A: "Wait, is openpiece tile-based or free movement?" — Yes.

> Community-facing explainer (devlog voice), written 2026-07. Engineering counterpart:
> `../design/PATHFINDING.md` (the planner layers) + `../ARCHITECTURE.md` (the sim foundation).

A question that keeps coming up: the world is clearly built from tiles (you can see it in the terrain, the
ship decks, the walls), but your character moves smoothly in any direction like an action game. Which is it?
How can it be both?

Short answer: it's both, they were never in conflict, and almost every game you love does this secretly.
Let me show you the machine.

---

## Two different questions

The confusion comes from thinking "the world is tiles" and "movement is free" are competing systems.
They're not — they answer **two completely different questions**:

- **Tiles answer: "what is HERE?"** Is this spot walkable? Is it deep water? Slow sand? Does it block a
  musket ball? The world is a big grid of answers.
- **Continuous positions answer: "where exactly is this body?"** Your character isn't "in tile (32, 16)" —
  they're at pixel (1037.4, 522.8), and they can be at (1037.5, 522.8) a millisecond later. That's why
  dodging, kiting, and knockback feel smooth instead of chess-like.

The entire bridge between these two worlds is one line of math: `tile = floor(position / tileSize)`. Any
smooth position converts to exactly one tile, instantly. Your body lives in smooth-space; whenever it needs
to know something about the world, it does that one division and asks the grid.

That's it. That's the "mixing." The grid is a *description* of the world, not a cage for bodies.

## So when does each one get used?

**Every tick, your body asks the ground questions.** When you walk toward the shore, the game reads the
tile under your feet: sand? Move a bit slower. Deep water? You're swimming now — new speed, new pose,
breath starts draining. Collision works the same way: your body is a circle, and as it moves, the game
checks every tile that circle touches (you can stand straddling four tiles at once — no snapping, ever).

**And when the AI needs to *think*, it thinks in tiles.** Here's the part that actually forces the grid to
exist: **you cannot pathfind over smooth space.** A pathfinding algorithm explores positions one by one
asking "can I get closer from here?" — and smooth space has *infinitely many* positions. You'd never
finish. A grid makes the world finite: our maps are a few hundred thousand tiles, which a computer can
search in a fraction of a millisecond.

So when a marine decides to chase you around a wall, this happens:

1. His brain picks a destination (smooth-space point, right where you're standing).
2. The pathfinder converts to tiles, runs A* over the grid, and hands back a chain of waypoints — tile
   centers, like breadcrumbs.
3. **And then he never walks that robotic tile-path.** He steers smoothly toward the next breadcrumb, and a
   line-of-sight check constantly asks "can I just run straight from here?" — skipping every breadcrumb he
   doesn't need.

**The plan is discrete. The walk is continuous.** Tiles are the AI's *thoughts*, not its footsteps.

## "But I've never seen a game do this"

You've seen it hundreds of times — that's the point. StarCraft, Diablo, Hades, Terraria, Kenshi… all
tile-based worlds with free-moving bodies. Factorio literally *shows* you the grid while your engineer
strolls over it diagonally. The games where you *notice* tiles — OSRS, RimWorld — chose tile-**locked**
movement on purpose (bodies hop cell to cell). We didn't, because locked movement would kill action combat:
you can't have satisfying dodge-timing when everyone teleports in 32-pixel increments.

The reason the hybrid is invisible is that good games plug the leaks that would give it away:

- **The staircase.** Naive path-following makes units zigzag diagonally tile-by-tile like they're descending
  stairs. The line-of-sight shortcut is the fix — cut every corner you can legally cut.
- **The robot stop.** Units that walk to the *exact center* of a tile and halt look mechanical. Fix: "close
  enough" arrival zones.
- **Shoreline flicker.** If you stand exactly on a water/land edge, which are you — swimmer or walker? Early
  on we had a whole family of bugs here. The fix was one brutally simple rule: *you are whatever the tile
  under your center says you are.* No prediction, no cleverness. The bugs died instantly.
- **Fat bodies.** A character isn't a point — it has a radius. Collision sweeps the whole circle against
  tiles so you never clip a corner your shoulders shouldn't fit through.

## Why this matters more than it looks

Here's the fun part: the grid barely exists for *you*. When you play, your fingers do all the navigation —
you don't need the game to tell you how to get around a wall. **The grid mostly exists for the AI.**

Every "smart" thing an NPC will ever do in openpiece is secretly a question to the grid: *Can I even reach
him? Which route avoids the shallows that slow me down? Where's cover from that musket line? Which regions
of this island have I actually seen?* One world, two views:

**Continuous for bodies. Discrete for minds.**

And that's the real reason the movement system is built this way — not because of how it feels today, but
because of what it lets the AI become later. More on that in the AI devlogs.
