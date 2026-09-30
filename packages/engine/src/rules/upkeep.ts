import type { Draft } from 'immer';
import type { GameState } from '../state/game';
import type { Region } from './regions';
import { unitUpkeep } from './units';

/**
 * Unit upkeep (GDD 4.4): every unit eats food at its owner's turn start, paid by the
 * treasury of the region it stands in. Paying, starvation and rebellion: see turnStart.
 */

/** Total upkeep of the units standing in a region. */
export function regionUpkeep(state: Pick<GameState, 'units'>, region: Region): number {
  let total = 0;
  for (const tile of region.tiles) {
    const unit = state.units[tile];
    if (unit) total += unitUpkeep(unit);
  }
  return total;
}

export function removeUnit(draft: Draft<GameState>, tile: number): void {
  // Units are keyed by tile index, so removing one means deleting its key.
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete draft.units[tile];
}
