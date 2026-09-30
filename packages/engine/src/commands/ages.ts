import type { Draft } from 'immer';
import { checkAdvanceAge } from '../rules/ages';
import type { GameEvent } from '../rules/events';
import type { GameState } from '../state/game';
import type { Validation } from './types';

export function validateAdvanceAge(state: GameState): Validation {
  const check = checkAdvanceAge(state, state.currentPlayer);
  return check.ok ? { ok: true } : { ok: false, error: check.error };
}

/** Pays the next age from the capital's treasury; it arrives at the next turn start. */
export function applyAdvanceAge(
  state: GameState,
  draft: Draft<GameState>,
  events: GameEvent[],
): void {
  const player = state.currentPlayer;
  const check = checkAdvanceAge(state, player);
  if (!check.ok) throw new Error(`Cannot advance: ${check.error}`);
  const center = draft.centers[check.center];
  const info = draft.players[player];
  if (!center || !info) throw new Error(`No capital for player ${player}`);
  const { cost } = check;
  center.treasury.gold -= cost.gold;
  center.treasury.food -= cost.food;
  center.treasury.materials -= cost.materials;
  info.advancing = check.age;
  events.push({ type: 'ageAdvanceStarted', player, center: check.center, age: check.age, cost });
}
