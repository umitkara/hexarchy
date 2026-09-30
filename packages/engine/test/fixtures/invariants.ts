import { expect } from 'vitest';
import { MAX_UNIT_LEVEL } from '../../src/balance';
import { computeRegions } from '../../src/rules/regions';
import { centerTiles, unitTiles, type GameState } from '../../src/state/game';
import { isOwnable } from '../../src/state/map';

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

/** Asserts the unit invariants (see `GameState.units`, GDD 6). */
export function expectUnitInvariants(state: GameState): void {
  for (const tile of unitTiles(state)) {
    const unit = state.units[tile];
    const owner = state.owners[tile];
    expect(owner, `unit on ${tile} must stand on an owned tile`).not.toBeNull();
    expect(owner).toBeDefined();
    expect(isOwnable(state.map.tiles[tile]?.terrain ?? 'sea')).toBe(true);
    if (!unit) continue;
    if (unit.line === 'worker') expect(unit.level).toBe(0);
    else {
      expect(unit.level).toBeGreaterThanOrEqual(1);
      expect(unit.level).toBeLessThanOrEqual(MAX_UNIT_LEVEL);
    }
    // Only the player on turn can have exhausted units.
    if (unit.exhausted) expect(owner).toBe(state.currentPlayer);
  }
}

/** All state invariants at once. */
export function expectInvariants(state: GameState): void {
  expectCenterInvariants(state);
  expectUnitInvariants(state);
}
