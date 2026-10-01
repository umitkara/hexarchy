import { gameStore, isDecided, type GameStoreState } from './gameStore';
import { clearSave, saveGame } from './save';

/** Saves are batched: the AI plays many commands in a row. */
const SAVE_DELAY_MS = 400;

function persist(state: GameStoreState): void {
  if (!state.started) return;
  // A decided game is not continued: the menu offers a new one.
  if (isDecided(state)) {
    clearSave();
    return;
  }
  saveGame({ history: state.history, commands: state.commands, hotseat: state.hotseat });
}

/**
 * Keeps the running game in localStorage (save and continue): after every change, batched,
 * and right away when the page is hidden (closing a tab or switching apps on a phone).
 * Returns the stop function.
 */
export function startAutosave(): () => void {
  let timer: number | undefined;

  const flush = () => {
    window.clearTimeout(timer);
    timer = undefined;
    persist(gameStore.getState());
  };

  const unsubscribe = gameStore.subscribe((state, previous) => {
    if (
      state.history === previous.history &&
      state.hotseat === previous.hotseat &&
      state.started === previous.started
    ) {
      return;
    }
    timer ??= window.setTimeout(flush, SAVE_DELAY_MS);
  });

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flush);
    if (timer !== undefined) flush();
  };
}
