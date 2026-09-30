import { ECONOMY } from '../balance';
import type { GameMap } from '../state/map';
import type { Region } from './regions';

/** Gold a tile yields per turn to its owner's region (GDD 3.1: land +1, forest 0). */
export function tileGold(map: GameMap, tile: number): number {
  const terrain = map.tiles[tile]?.terrain;
  return terrain === undefined ? 0 : ECONOMY.tileGold[terrain];
}

/** Gold of a region's tiles per turn (paid only if it has a center to hold it). */
export function regionGoldIncome(map: GameMap, region: Region): number {
  let gold = 0;
  for (const tile of region.tiles) gold += tileGold(map, tile);
  return gold;
}
