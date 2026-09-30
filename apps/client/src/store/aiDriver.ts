import { gameStore, isAiTurn, type GameStoreState } from './gameStore';

/** Pause between two moves of an AI player. */
const AI_STEP_MS = 140;
/** Pause before an AI player's first move (after the previous player ended the turn). */
const AI_TURN_GAP_MS = 450;

function delayOf(state: GameStoreState): number {
  if (state.aiFast) return 0;
  return state.aiTurn === null ? AI_TURN_GAP_MS : AI_STEP_MS;
}

/**
 * Plays the AI players' turns as a quick animation (GDD 12): one command per timer tick,
 * so every move shows on the map; skipping (`aiFast`) plays on without pauses. Runs
 * whenever an AI player is on turn and hotseat is off. Returns the stop function.
 */
export function startAiDriver(): () => void {
  let timer: number | undefined;

  const schedule = () => {
    if (timer !== undefined) return;
    const state = gameStore.getState();
    if (!isAiTurn(state)) return;
    timer = window.setTimeout(tick, delayOf(state));
  };

  const tick = () => {
    timer = undefined;
    gameStore.getState().stepAi();
    schedule();
  };

  const unsubscribe = gameStore.subscribe(schedule);
  schedule();
  return () => {
    unsubscribe();
    window.clearTimeout(timer);
    timer = undefined;
  };
}
