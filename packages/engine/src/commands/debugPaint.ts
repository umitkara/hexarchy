import type { Draft } from 'immer';
import { changeOwners } from '../rules/centers';
import type { GameEvent } from '../rules/events';
import type { GameState } from '../state/game';
import { isOwnable } from '../state/map';
import type { DebugPaintCommand, Validation } from './types';

export function validateDebugPaint(state: GameState, command: DebugPaintCommand): Validation {
  const { tile, owner } = command;
  const current = state.owners[tile];
  const terrain = state.map.tiles[tile]?.terrain;
  if (!Number.isInteger(tile) || current === undefined || terrain === undefined) {
    return { ok: false, error: 'unknownTile' };
  }
  if (owner !== null && !state.players.some((p) => p.id === owner)) {
    return { ok: false, error: 'unknownPlayer' };
  }
  if (owner !== null && state.players[owner]?.eliminated) return { ok: false, error: 'eliminated' };
  if (owner !== null && !isOwnable(terrain)) return { ok: false, error: 'notOwnable' };
  if (current === owner) return { ok: false, error: 'noChange' };
  if (state.centers[tile]?.kind === 'capital') return { ok: false, error: 'capitalLocked' };
  return { ok: true };
}

export function applyDebugPaint(
  draft: Draft<GameState>,
  command: DebugPaintCommand,
  events: GameEvent[],
): void {
  changeOwners(draft, [{ tile: command.tile, owner: command.owner }], events);
}
