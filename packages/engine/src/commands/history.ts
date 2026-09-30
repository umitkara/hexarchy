import type { GameState } from '../state/game';
import { apply } from './apply';
import type { Command, CommandResult } from './types';

/**
 * In-turn undo (GDD 13): commands are deterministic, so a stack of the states since the
 * turn started is all it takes. Ending the turn commits it and clears the stack.
 * Plain immutable data; the client keeps one and the tests drive it directly.
 */
export interface TurnHistory {
  /** States before each command of this turn, oldest (the turn start) first. */
  readonly past: readonly GameState[];
  readonly present: GameState;
}

export function startHistory(state: GameState): TurnHistory {
  return { past: [], present: state };
}

export interface HistoryResult {
  readonly history: TurnHistory;
  readonly events: CommandResult['events'];
}

/** Applies a valid command (throws otherwise) and records it; `endTurn` clears the stack. */
export function applyToHistory(history: TurnHistory, command: Command): HistoryResult {
  const { state, events } = apply(history.present, command);
  if (command.type === 'endTurn') return { history: startHistory(state), events };
  return { history: { past: [...history.past, history.present], present: state }, events };
}

export function canUndo(history: TurnHistory): boolean {
  return history.past.length > 0;
}

/** Takes back the last command of this turn. */
export function undo(history: TurnHistory): TurnHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return { past: history.past.slice(0, -1), present: previous };
}

/** Takes back every command of this turn. */
export function undoTurn(history: TurnHistory): TurnHistory {
  const start = history.past[0];
  return start ? startHistory(start) : history;
}
