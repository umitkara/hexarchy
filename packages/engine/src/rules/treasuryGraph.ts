import { openRiver, type EdgeState } from './edgeState';

/**
 * Treasury graph (GDD 3.2, 4.2): which adjacent tiles pool their resources when owned by
 * the same player. A river cuts the link unless it is bridged; a ford connects. Fences,
 * walls and gates do not cut it.
 */
export function treasuryLinked(state: EdgeState, a: number, b: number): boolean {
  return !openRiver(state, a, b);
}
