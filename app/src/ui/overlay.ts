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
    if (e.key.toLowerCase() !== 'h' || !started || !overlay) return;
    const nowHidden = overlay.classList.toggle('hidden');
    events.emit('setPaused', { paused: nowHidden === false });
  });
}
