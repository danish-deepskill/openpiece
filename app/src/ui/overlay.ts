import { events } from '../core/EventBus';

/**
 * Binds the DOM start/help overlay (in index.html) to the EventBus. The "Set Sail" button
 * starts the game; `H` toggles the panel and pauses/resumes via `setPaused`.
 */
export function bindOverlay(): void {
  const overlay = document.getElementById('startOverlay');
  const btn = document.getElementById('startBtn');
  let started = false;

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
    if (e.key.toLowerCase() !== 'h' || !started || !overlay) return;
    const nowHidden = overlay.classList.toggle('hidden');
    events.emit('setPaused', { paused: nowHidden === false });
  });
}
