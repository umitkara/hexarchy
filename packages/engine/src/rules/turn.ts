import type { Draft } from 'immer';
import { ECONOMY } from '../balance';
import type { GameState } from '../state/game';
import { collectIncome } from './economy';
import type { GameEvent } from './events';
import { payUpkeep } from './upkeep';

/**
 * Ends the current player's turn and starts the next one (GDD 2). The ending player's
 * units are rested. Turn start, from round `ECONOMY.firstIncomeRound` on: income, then
 * unit upkeep (bankrupt regions lose their units). Starvation and forest spread follow
 * in M4.
 */
export function endTurn(draft: Draft<GameState>, events: GameEvent[]): void {
  events.push({ type: 'turnEnded', player: draft.currentPlayer });
  // Only the current player's units can be exhausted.
  for (const unit of Object.values(draft.units)) if (unit) unit.exhausted = false;
  const next = (draft.currentPlayer + 1) % draft.players.length;
  if (next === 0) draft.round += 1;
  draft.currentPlayer = next;
  events.push({ type: 'turnStarted', player: next, round: draft.round });
  if (draft.round >= ECONOMY.firstIncomeRound) {
    collectIncome(draft, next, events);
    payUpkeep(draft, next, events);
  }
}
