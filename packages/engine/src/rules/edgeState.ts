import { edgeKey } from '../hex/edge';
import type { EdgeStructure, GameState } from '../state/game';
import type { EdgeFeature } from '../state/map';

/**
 * What stands on the edge between two adjacent tiles: the map's natural feature (river,
 * ford) and a built structure (GDD 3.2). The movement, treasury and protection graphs all
 * read edges through here.
 */
export type EdgeState = Pick<GameState, 'map' | 'edgeStructures'>;

export function naturalEdgeAt(state: EdgeState, a: number, b: number): EdgeFeature | undefined {
  return state.map.edges[edgeKey(a, b)];
}

export function structureAt(state: EdgeState, a: number, b: number): EdgeStructure | undefined {
  return state.edgeStructures[edgeKey(a, b)];
}

/** A river without a bridge: it cuts movement, treasuries and melee protection. */
export function openRiver(state: EdgeState, a: number, b: number): boolean {
  return (
    naturalEdgeAt(state, a, b)?.kind === 'river' && structureAt(state, a, b)?.kind !== 'bridge'
  );
}
