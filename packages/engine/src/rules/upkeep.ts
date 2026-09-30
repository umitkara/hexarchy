import type { Draft } from 'immer';
import { UPKEEP } from '../balance';
import type { GameState, PlayerId } from '../state/game';
import type { GameEvent } from './events';
import { getRegions, regionCenter, type Region } from './regions';
import { unitUpkeep } from './units';

/**
 * Unit upkeep (GDD 4.4), paid at turn start after income, per region (Slay):
 * - the region's treasury pays the upkeep of every unit standing in the region;
 * - if it cannot, the treasury drops to 0 and all units of the region die;
 * - units in a region without a treasury (a lone tile) die.
 * GDD pays upkeep in food with starvation (M4); until then it is paid in gold.
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

export function payUpkeep(draft: Draft<GameState>, player: PlayerId, events: GameEvent[]): void {
  const { resource } = UPKEEP;
  const { regions } = getRegions(draft);
  for (const region of regions) {
    if (region.owner !== player) continue;
    const owed = regionUpkeep(draft, region);
    if (owed === 0) continue;
    const center = regionCenter(draft, region);
    const treasury = center === undefined ? undefined : draft.centers[center]?.treasury;
    if (center !== undefined && treasury && treasury[resource] >= owed) {
      treasury[resource] -= owed;
      events.push({ type: 'upkeepPaid', player, center, resource, amount: owed });
      continue;
    }
    if (center !== undefined && treasury) {
      events.push({ type: 'bankrupt', player, center, resource, owed, lost: treasury[resource] });
      treasury[resource] = 0;
    }
    for (const tile of region.tiles) {
      const unit = draft.units[tile];
      if (!unit) continue;
      events.push({
        type: 'unitKilled',
        tile,
        owner: player,
        unit: { ...unit },
        reason: treasury ? 'bankrupt' : 'noTreasury',
      });
      removeUnit(draft, tile);
    }
  }
}

export function removeUnit(draft: Draft<GameState>, tile: number): void {
  // Units are keyed by tile index, so removing one means deleting its key.
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete draft.units[tile];
}
