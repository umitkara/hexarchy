import type { Draft } from 'immer';
import type { GameEvent } from '../rules/events';
import { AGES, type GameState } from '../state/game';
import type { DebugSetAgeCommand, Validation } from './types';

export function validateDebugSetAge(state: GameState, command: DebugSetAgeCommand): Validation {
  const player = state.players[command.player];
  if (player?.id !== command.player) return { ok: false, error: 'unknownPlayer' };
  if (!AGES.includes(command.age)) return { ok: false, error: 'unknownAge' };
  if (player.age === command.age) return { ok: false, error: 'noChange' };
  return { ok: true };
}

export function applyDebugSetAge(
  draft: Draft<GameState>,
  command: DebugSetAgeCommand,
  events: GameEvent[],
): void {
  const player = draft.players[command.player];
  if (!player) return;
  player.age = command.age;
  events.push({ type: 'ageChanged', player: command.player, age: command.age });
}
