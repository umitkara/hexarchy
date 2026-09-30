import { edgeKey } from '../hex/edge';
import type { EdgeFeature, GameMap } from '../state/map';

/**
 * Treasury graph (GDD 3.2, 4.2): which adjacent tiles pool their resources when owned by
 * the same player. A river edge cuts the link; a ford connects. Bridges (connect) and
 * fences/walls/gates (do not cut) join in M5.
 */
export function edgeLinksTreasury(feature: EdgeFeature | undefined): boolean {
  return feature?.kind !== 'river';
}

/** True if two adjacent tiles are linked in the treasury graph (ignoring ownership). */
export function treasuryLinked(map: GameMap, a: number, b: number): boolean {
  return edgeLinksTreasury(map.edges[edgeKey(a, b)]);
}
