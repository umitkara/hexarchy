import type { Draft } from 'immer';
import { ECONOMY } from '../balance';
import type { GameState, PlayerId } from '../state/game';
import type { GameMap } from '../state/map';
import type { GameEvent } from './events';
import { getRegions, regionCenter, type Region } from './regions';

/** Gold a tile yields per turn to its owner's region (GDD 3.1: land +1, forest 0). */
export function tileGold(map: GameMap, tile: number): number {
  const terrain = map.tiles[tile]?.terrain;
  return terrain === undefined ? 0 : ECONOMY.tileGold[terrain];
}

/** Turn-start gold income of a region (paid only if it has a center to hold it). */
export function regionGoldIncome(map: GameMap, region: Region): number {
  let gold = 0;
  for (const tile of region.tiles) gold += tileGold(map, tile);
  return gold;
}

/**
 * Pays turn-start income into every treasury of `player`. Regions without a center
 * (single tiles) have no treasury, so their income is lost.
 */
export function collectIncome(
  draft: Draft<GameState>,
  player: PlayerId,
  events: GameEvent[],
): void {
  const { regions } = getRegions(draft);
  for (const region of regions) {
    if (region.owner !== player) continue;
    const center = regionCenter(draft, region);
    const treasury = center === undefined ? undefined : draft.centers[center]?.treasury;
    if (center === undefined || !treasury) continue;
    const gold = regionGoldIncome(draft.map, region);
    treasury.gold += gold;
    events.push({ type: 'income', player, center, gold });
  }
}
