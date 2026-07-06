/** What the HUD needs to draw the current dialogue frame. */
export interface DialogueView {
  name: string;
  skin: number; // speaker avatar fill (their body color)
  ring: number; // speaker avatar ring (their faction/hat color)
  text: string; // the line so far (typewriter-revealed)
  done: boolean; // the current line is fully revealed
  last: boolean; // this is the final line of the conversation
  choice?: string; // the yes/no prompt, shown once the last line is fully revealed (else undefined)
}

interface Session {
  name: string;
  skin: number;
  ring: number;
  lines: string[];
  idx: number;
  t: number;
  choice?: string; // prompt text for a post-dialogue decision (shown once the last line is fully revealed)
  onChoose?: (yes: boolean) => void; // resolved by choose(); fires once
}

/**
 * A non-modal dialogue session with a typewriter reveal. `open()` starts a conversation; the HUD draws `view()`
 * each frame; `advance()` (on E) skips the reveal if mid-type, else steps to the next line. A session may end
 * with a CHOICE (yes/no) — after the last line, `advance()` doesn't close; it waits for `choose(yes)` (Y/N),
 * which runs `onChoose` then closes. State is a single session (not stored on the NPC), so a re-talk restarts.
 */
export class DialogueSystem {
  private static readonly CPS = 42; // characters revealed per second
  private state: Session | null = null;

  /** Open a conversation; optionally end with a yes/no `choice` prompt whose result runs `onChoose`. */
  open(name: string, lines: string[], skin: number, ring: number, choice?: string, onChoose?: (yes: boolean) => void): void {
    if (lines.length) this.state = { name, skin, ring, lines, idx: 0, t: 0, choice, onChoose };
  }

  /** Advance the typewriter timer. */
  update(dt: number): void {
    if (this.state) this.state.t += dt;
  }

  /** E pressed: finish the reveal if still typing, else next line. Past the last line it CLOSES — unless a
   *  choice is pending, in which case it holds (waiting for choose()). True if a dialogue was active. */
  advance(): boolean {
    const s = this.state;
    if (!s) return false;
    const full = s.lines[s.idx];
    if (Math.floor(s.t * DialogueSystem.CPS) < full.length) {
      s.t = full.length / DialogueSystem.CPS; // reveal the rest instantly (E skips the typewriter)
    } else if (s.idx < s.lines.length - 1) {
      s.idx++;
      s.t = 0;
    } else if (!s.choice) {
      this.state = null; // no choice → conversation over on the last line (a choice keeps it open for Y/N)
    }
    return true;
  }

  /** Whether a yes/no choice is awaiting input: on the last line, fully revealed. The full-reveal gate is what
   *  keeps the Y/N from appearing while the line is still typing (the earlier "premature choice" bug). */
  get choosing(): boolean {
    const s = this.state;
    if (!s || !s.choice || s.idx < s.lines.length - 1) return false;
    return Math.floor(s.t * DialogueSystem.CPS) >= s.lines[s.idx].length;
  }

  /** Resolve a pending choice (Y = true / N = false): run onChoose and close. No-op if not choosing. */
  choose(yes: boolean): void {
    if (!this.choosing) return;
    const onChoose = this.state!.onChoose;
    this.state = null;
    onChoose?.(yes);
  }

  close(): void {
    this.state = null;
  }

  get active(): boolean {
    return this.state !== null;
  }

  view(): DialogueView | null {
    const s = this.state;
    if (!s) return null;
    const full = s.lines[s.idx];
    const n = Math.min(full.length, Math.floor(s.t * DialogueSystem.CPS));
    const last = s.idx >= s.lines.length - 1;
    return {
      name: s.name, skin: s.skin, ring: s.ring, text: full.slice(0, n), done: n >= full.length, last,
      choice: last && n >= full.length ? s.choice : undefined, // Y/N shows once the last line is fully revealed
    };
  }
}
