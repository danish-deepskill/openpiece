import { events } from '../core/EventBus';

/**
 * Binds the DOM start/help overlay (in index.html) to the EventBus. The "Set Sail" button
 * starts the game; `H` toggles the panel and pauses/resumes via `setPaused`; `P` pauses/resumes with NO panel —
 * a frozen frame you can screenshot (the sim holds mid-swing; the swing visuals hold with it). Both live here, not
 * in InputSystem: that system only runs while the director is in 'play', so a key handled there could never resume.
 */
export function bindOverlay(): void {
  const overlay = document.getElementById('startOverlay');
  const btn = document.getElementById('startBtn');
  let started = false;
  let frozen = false; // the P pause (independent of the help panel's own pause)

  btn?.addEventListener('click', () => {
    overlay?.classList.add('hidden');
    started = true;
    events.emit('startGame', {});
  });

  window.addEventListener('keydown', (e) => {
    // ENTER sets sail (a keyboard shortcut for the "Set Sail" button — a real user gesture, so audio + the
    // scene's startGame listener are both live by the time it fires)
    if (!started && e.key === 'Enter') {
      e.preventDefault();
      btn?.click();
      return;
    }
    if (!started || !overlay) return;
    const key = e.key.toLowerCase();
    if (key === 'p' && overlay.classList.contains('hidden')) {
      // the clean pause: no panel over the view. Ignored while the help panel is open (that pause is the panel's).
      frozen = !frozen;
      events.emit('setPaused', { paused: frozen });
      events.emit('notify', { msg: frozen ? 'Paused (P to resume)' : 'Resumed' });
      return;
    }
    if (key !== 'h') return;
    const nowHidden = overlay.classList.toggle('hidden');
    frozen = false; // the panel's toggle owns the pause state from here: closing it resumes
    events.emit('setPaused', { paused: nowHidden === false });
  });
}
