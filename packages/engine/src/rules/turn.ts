import type { Draft } from 'immer';
import { ECONOMY } from '../balance';
import type { GameState } from '../state/game';
import { collectIncome } from './economy';
import type { GameEvent } from './events';

/**
 * Ends the current player's turn and starts the next one (GDD 2). Turn start, for now:
 * income (from round `ECONOMY.firstIncomeRound`). Upkeep, starvation and forest spread
 * follow in M4.
 */
export function endTurn(draft: Draft<GameState>, events: GameEvent[]): void {
  events.push({ type: 'turnEnded', player: draft.currentPlayer });
  const next = (draft.currentPlayer + 1) % draft.players.length;
  if (next === 0) draft.round += 1;
  draft.currentPlayer = next;
  events.push({ type: 'turnStarted', player: next, round: draft.round });
  if (draft.round >= ECONOMY.firstIncomeRound) collectIncome(draft, next, events);
}
