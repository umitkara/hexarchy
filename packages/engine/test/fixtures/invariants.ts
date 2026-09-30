import { expect } from 'vitest';
import { computeRegions } from '../../src/rules/regions';
import { centerTiles, type GameState } from '../../src/state/game';

/** Asserts the center invariants of GDD 4.2 (see `GameState.centers`). */
export function expectCenterInvariants(state: GameState): void {
  const { regions, regionOf } = computeRegions(state.map, state.owners);
  for (const tile of centerTiles(state)) {
    expect(state.owners[tile], `center ${tile} must be owned`).not.toBeNull();
  }
  for (const region of regions) {
    const centers = region.tiles.filter((t) => state.centers[t] !== undefined);
    if (region.tiles.length >= 2) {
      expect(centers, `region at ${region.tiles[0]} needs exactly one center`).toHaveLength(1);
    } else {
      const center = centers[0] === undefined ? undefined : state.centers[centers[0]];
      if (center) expect(center.kind, `single tile ${region.tiles[0]}`).toBe('capital');
    }
  }
  for (const player of state.players) {
    const capitals = centerTiles(state).filter(
      (t) => state.centers[t]?.kind === 'capital' && state.owners[t] === player.id,
    );
    expect(capitals.length).toBeLessThanOrEqual(1);
  }
  expect(regionOf.length).toBe(state.owners.length);
}
