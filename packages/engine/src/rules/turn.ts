import type { Draft } from 'immer';
import { ECONOMY } from '../balance';
import type { GameState } from '../state/game';
import type { GameEvent } from './events';
import { spreadForest } from './forest';
import { applyTurnStart } from './turnStart';

/**
 * Ends the current player's turn and starts the next one (GDD 2). The ending player's
 * units are rested. Turn start, from round `ECONOMY.firstIncomeRound` on: income →
 * building upkeep → production → food upkeep, starvation and rebellion (see turnStart),
 * then forest spread.
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
    applyTurnStart(draft, next, events);
    spreadForest(draft, next, events);
  }
}
