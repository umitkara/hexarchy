import type { Draft } from 'immer';
import { addResources, type GameState, type PlayerStats } from '../state/game';
import type { GameEvent } from './events';

/**
 * Match statistics (see PlayerStats): counted from a command's events after it is applied,
 * so the rules themselves stay free of bookkeeping; the peak territory is checked after
 * every command. Deterministic and undone with the command like any other state.
 */
export function recordStats(draft: Draft<GameState>, events: readonly GameEvent[]): void {
  const player = draft.currentPlayer;
  const stats = (id: number): Draft<PlayerStats> => {
    const entry = draft.stats[id];
    if (!entry) throw new Error(`No statistics for player ${id}`);
    return entry;
  };
  for (const event of events) {
    switch (event.type) {
      case 'tileOwnerChanged':
        if (event.to !== null) stats(event.to).tilesCaptured += 1;
        break;
      case 'unitKilled':
        stats(event.owner).unitsLost += 1;
        if (event.reason === 'captured' && event.owner !== player) stats(player).unitsKilled += 1;
        break;
      case 'income': {
        const entry = stats(event.player);
        entry.income = addResources(entry.income, event.income);
        break;
      }
      case 'unitBought':
        stats(event.player).unitsBought += 1;
        break;
      case 'buildingBuilt':
        stats(event.player).buildingsBuilt += 1;
        break;
      case 'edgeBuilt':
        stats(event.player).structuresBuilt += 1;
        break;
      case 'ageReached':
        stats(event.player).ageRounds[event.age] ??= draft.round;
        break;
      default:
        break;
    }
  }

  const tiles = new Array<number>(draft.players.length).fill(0);
  for (const owner of draft.owners) if (owner !== null) tiles[owner] = (tiles[owner] ?? 0) + 1;
  tiles.forEach((count, id) => {
    const entry = stats(id);
    if (count > entry.peakTiles) {
      entry.peakTiles = count;
      entry.peakRound = draft.round;
    }
  });
}
