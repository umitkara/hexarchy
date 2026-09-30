import type { Draft } from 'immer';
import { FOREST_SPREAD } from '../balance';
import { Rng } from '../rng';
import type { GameState, PlayerId } from '../state/game';
import { mapGrid } from '../state/map';
import type { GameEvent } from './events';

/**
 * Forest spread (GDD 4.6): at a player's turn start, forest creeps onto their plains
 * tiles that have no building or center and are not next to a lumber camp; the chance
 * grows with the number of neighboring forests. A forested tile yields no gold.
 * Neutral land never changes. Randomness comes from the state's RNG, so it is
 * deterministic; tiles are rolled in ascending order against the terrain before the spread.
 */

/** Tiles of `player` that forest may spread onto now, with their forest neighbor counts. */
export function forestSpreadCandidates(
  state: Pick<GameState, 'map' | 'owners' | 'centers' | 'buildings'>,
  player: PlayerId,
): { readonly tile: number; readonly forests: number }[] {
  const grid = mapGrid(state.map);
  const candidates: { tile: number; forests: number }[] = [];
  for (let tile = 0; tile < grid.tileCount; tile++) {
    if (state.owners[tile] !== player || state.map.tiles[tile]?.terrain !== 'plains') continue;
    if (state.buildings[tile] || state.centers[tile]) continue;
    const neighbors = grid.neighbors(tile);
    if (neighbors.some((n) => state.buildings[n]?.kind === 'lumberCamp')) continue;
    const forests = neighbors.filter((n) => state.map.tiles[n]?.terrain === 'forest').length;
    if (forests > 0) candidates.push({ tile, forests });
  }
  return candidates;
}

/** The chance that a candidate with `forests` neighboring forests turns into forest. */
export function forestSpreadChance(forests: number): number {
  return 1 - (1 - FOREST_SPREAD.chancePerForest) ** forests;
}

export function spreadForest(draft: Draft<GameState>, player: PlayerId, events: GameEvent[]): void {
  const candidates = forestSpreadCandidates(draft, player);
  if (candidates.length === 0) return;
  const rng = new Rng(draft.rng);
  const spread = candidates
    .filter(({ forests }) => rng.chance(forestSpreadChance(forests)))
    .map(({ tile }) => tile);
  draft.rng = [...rng.getState()];
  for (const tile of spread) draft.map.tiles[tile] = { terrain: 'forest', vein: false };
  if (spread.length > 0) events.push({ type: 'forestSpread', player, tiles: spread });
}
