/** What the HUD needs to draw the current dialogue frame. */
export interface DialogueView {
  name: string;
  skin: number; // speaker avatar fill (their body color)
  ring: number; // speaker avatar ring (their faction/hat color)
  text: string; // the line so far (typewriter-revealed)
  done: boolean; // the current line is fully revealed
  last: boolean; // this is the final line of the conversation
}

/**
 * A non-modal dialogue session with a typewriter reveal. `open()` starts a conversation; the HUD draws `view()`
 * each frame; `advance()` (on E) skips the reveal if mid-type, else steps to the next line and closes after the
 * last. State is a single session here — not stored on the NPC — so a re-talk simply restarts it.
 */
export class DialogueSystem {
  private static readonly CPS = 42; // characters revealed per second
  private state: { name: string; skin: number; ring: number; lines: string[]; idx: number; t: number } | null = null;

  open(name: string, lines: string[], skin: number, ring: number): void {
    if (lines.length) this.state = { name, skin, ring, lines, idx: 0, t: 0 };
  }

  /** Advance the typewriter timer. */
  update(dt: number): void {
    if (this.state) this.state.t += dt;
  }

  /** E pressed: finish the reveal if still typing, else go to the next line (closing past the last). True if active. */
  advance(): boolean {
    const s = this.state;
    if (!s) return false;
    const full = s.lines[s.idx];
    if (Math.floor(s.t * DialogueSystem.CPS) < full.length) {
      s.t = full.length / DialogueSystem.CPS; // reveal the rest instantly
    } else {
      s.idx++;
      s.t = 0;
      if (s.idx >= s.lines.length) this.state = null; // conversation over
    }
    return true;
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
    return { name: s.name, skin: s.skin, ring: s.ring, text: full.slice(0, n), done: n >= full.length, last: s.idx >= s.lines.length - 1 };
  }
}
