# Openpiece — Claude Code workspace guide (for humans)

What's in `.claude/`, what runs automatically, and how to use it. The agent-facing context is `CLAUDE.md` +
`docs/`; this file is for you.

## What happens automatically — no action needed

- **Rules** (`.claude/rules/*.md`) — path-scoped. When Claude touches files under `app/src/systems/**`,
  `app/src/defs/**`, etc., the matching rule (ECS hot-loop / content-is-data / TS style) loads into its
  context on its own. You never invoke these.
- **Hooks** (`.claude/settings.json` + `.claude/hooks/`) — at the end of any turn where Claude edited a
  `.ts` file under `app/src`, the project's `tsc --noEmit` runs once. On errors, Claude is blocked with the
  compiler output and fixes them before finishing; on a clean pass you see nothing. Applies to EVERY Claude
  session in this repo (activates at session start — restart a session for it to pick up hook changes).
- **Skill auto-invocation** — the skills' one-line descriptions sit in Claude's context permanently; when a
  request matches ("add a new enemy unit"), Claude invokes the skill itself without being told.

## The manual levers — what you can type

| You type | What happens |
|---|---|
| `/add-def unit: marine grunt` | Walks the add-content workflow: def row, id grammar, `parent` variants, boot validator, sweep test |
| `/add-system` | Walks adding a system: sim-vs-presentation boundary, WorldScene wiring, update-order placement, headless test |
| `/check-canon` | Reviews the current working diff against DESIGN_PATTERNS §12 + EDGE_CASES ★, then runs typecheck + tests |
| "use the **canon-reviewer** agent on this diff" | Spawns the review subagent in a fresh context — reads the rubric, greps for mechanical violations (id branches, sim impurity, dt bugs…) |
| "run the **silent-failure-hunter** on defs/ and combat/" | Spawns the sweep for swallowed errors, `??` masking bad def data, EventBus dead letters |

No special syntax needed — plain English works because descriptions auto-match:
- "add a unit / ability / accessory / hat…" → `add-def`
- "create a XxxSystem that…" → `add-system`
- "does this follow our canon?" / "review before committing" → `check-canon` / canon-reviewer
- "combat works but something feels off, tests pass though" → silent-failure-hunter

## A simple working loop

1. **Feature work:** just ask for the feature. Rules + the typecheck hook guard the basics silently.
2. **Before committing** a nontrivial chunk: `/check-canon` (small diff) or ask for the canon-reviewer (big diff).
3. **After content/def-heavy changes:** ask for a silent-failure-hunter sweep.
4. **Built-ins still apply** — `/code-review` for bug-hunting, `/simplify` for cleanup. The custom agents add
   canon awareness on top of those, they don't replace them.

## How to phrase requests — patterns that get better results in THIS codebase

- **Content ("add a marine with a spear"):** give intent + relationships, not implementation — faction, tier,
  what makes it distinct in play ("long-reach narrow thrust, patrols, engages bandits on sight"). The engine
  makes implementation nearly free; the design decisions are the part Claude can't guess.
- **Feel-tuning ("kick a bit longer"):** first ask for the knob map — "show me the kick's tuning knobs (ability
  def + motion) and what each changes" — then direct ONE knob per iteration. You are the playtester; Claude
  can't feel the game. Longer = reach? active window? recovery? Say which.
- **Debugging ("why isn't my cow fleeing?"):** give expected vs actual + when it last worked ("stands still
  when hit; should bolt for a few seconds; worked before X"). For works-but-silently-wrong bugs, ask for the
  silent-failure-hunter.
- **Judgment ("is X good design?"):** never yes/no — ask for "2–3 options with tradeoffs against our pillars
  (data-driven, the Moat, headless sim, determinism), recommend one, name the rejected alternative." And check
  `docs/design/` first — X may already be designed.
- **Committing:** name the scope ("commit just the wildlife work") — the tree often holds unrelated in-flight
  changes — and chain the check: "/check-canon, fix findings, then commit".
- **Doc'd features ("add posture bar"):** name the doc — "implement posture per docs/design/COMBAT.md; plan
  first (components/systems/defs touched, update-order placement, HUD), then build with tests." Pointing at
  the doc is the highest-leverage thing you can type.
- **When the Stop hook blocks a turn:** do nothing — that's the safety net working; Claude fixes and finishes.
  Only intervene if it starts fixing pre-existing errors owned by the other session ("leave those").

## Maintenance

- Renames/moves under `app/src` must keep `.claude/rules/*.md` globs and file references true — same rule as
  the docs: stale rules are bugs. (The dev agent should do this as part of the change.)
- Hooks not firing? Restart the session and run `/hooks` to inspect. The scripts are plain Node — test by hand:
  `echo '{"session_id":"t","tool_input":{"file_path":"c:/.../app/src/x.ts"}}' | node .claude/hooks/post-edit-accumulator.js`
  then `echo '{"session_id":"t"}' | node .claude/hooks/stop-typecheck.js` (exit 0 = clean, exit 2 = errors printed).
