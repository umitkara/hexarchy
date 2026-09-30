import { START, type MapSize } from '../balance';
import { generateMap } from '../map/generate';
import { placeStarts, startTerritory } from '../map/starts';
import { createRngState, deriveSeed, normalizeSeed } from '../rng';
import type { Center, GameState, Player, PlayerId } from './game';
import { mapGrid } from './map';

export interface CreateGameOptions {
  readonly seed: number;
  readonly size?: MapSize;
  readonly players?: number;
}

/**
 * A new game from a seed (GDD 4.7): generated map with fair starts; every player gets a
 * capital, the starting territory around it and the starting treasury; the rest of the
 * map is neutral. Player 0 is the human and moves first. Deterministic.
 */
export function createGame(options: CreateGameOptions): GameState {
  const seed = normalizeSeed(options.seed);
  const playerCount = options.players ?? START.players;
  const generated = generateMap({ seed, ...(options.size && { size: options.size }) });
  const { map, starts } = placeStarts(generated, playerCount, deriveSeed(seed, 'starts'));

  const owners: (PlayerId | null)[] = new Array<PlayerId | null>(mapGrid(map).tileCount).fill(null);
  const centers: Record<number, Center> = {};
  const players: Player[] = starts.map((capital, id) => {
    for (const tile of startTerritory(map, capital, START.territoryTiles)) owners[tile] = id;
    centers[capital] = { kind: 'capital', treasury: { ...START.treasury } };
    return { id, controller: id === 0 ? 'human' : 'ai' };
  });

  return {
    map,
    round: 1,
    currentPlayer: 0,
    players,
    owners,
    centers,
    rng: createRngState(deriveSeed(seed, 'game')),
  };
}
