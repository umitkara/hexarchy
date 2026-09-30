import { expect } from 'vitest';
import { AGE_ADVANCE, BUILDINGS, MAX_UNIT_LEVEL, STRUCTURES, UNITS } from '../../src/balance';
import { edgeTiles } from '../../src/hex';
import { computeRegions } from '../../src/rules/regions';
import {
  activePlayers,
  AGES,
  buildingTiles,
  capitalOf,
  centerTiles,
  nextAge,
  structureEdges,
  unitTiles,
  winnerOf,
  type GameState,
} from '../../src/state/game';
import { isOwnable, mapGrid } from '../../src/state/map';

/** Asserts the center invariants of GDD 4.2 (see `GameState.centers`). */
export function expectCenterInvariants(state: GameState): void {
  const { regions, regionOf } = computeRegions(state, state.owners);
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
      expect(unit.level, `${unit.line} on ${tile}`).toBeLessThanOrEqual(UNITS[unit.line].maxLevel);
    }
    // Only the player on turn can have exhausted units; only the others suppressed ones.
    if (unit.exhausted) expect(owner).toBe(state.currentPlayer);
    if (unit.suppressed) expect(owner).not.toBe(state.currentPlayer);
  }
}

/** Asserts the building invariants (see `GameState.buildings`, GDD 5). */
export function expectBuildingInvariants(state: GameState): void {
  for (const tile of buildingTiles(state)) {
    const building = state.buildings[tile];
    expect(state.owners[tile], `building on ${tile} must stand on an owned tile`).not.toBeNull();
    if (!building) continue;
    const land = state.map.tiles[tile];
    const spec = BUILDINGS[building.kind];
    expect(spec.terrain as readonly string[], `building on ${tile}`).toContain(land?.terrain);
    if (spec.vein) expect(land?.vein).toBe(true);
    // Upkeep-free buildings never idle.
    if (spec.upkeep === 0) expect(building.idle).toBe(false);
  }
}

/** Asserts the edge structure invariants (see `GameState.edgeStructures`, GDD 5.3). */
export function expectStructureInvariants(state: GameState): void {
  const grid = mapGrid(state.map);
  for (const key of structureEdges(state)) {
    const structure = state.edgeStructures[key];
    if (!structure) continue;
    const [a, b] = edgeTiles(key);
    expect(grid.areAdjacent(a, b), `structure on ${key}`).toBe(true);
    for (const t of [a, b]) expect(isOwnable(state.map.tiles[t]?.terrain ?? 'sea')).toBe(true);
    const river = state.map.edges[key]?.kind === 'river';
    expect(river, `${structure.kind} on ${key}`).toBe(STRUCTURES[structure.kind].onRiver);
    expect(Number.isInteger(structure.damage)).toBe(true);
    expect(structure.damage).toBeGreaterThanOrEqual(0);
    expect(structure.damage).toBeLessThan(STRUCTURES[structure.kind].hits);
    expect(state.players.some((p) => p.id === structure.owner)).toBe(true);
    // Land on both sides of one player carries that player's structure (decision 30).
    const side = state.owners[a] ?? null;
    if (side !== null && side === state.owners[b]) expect(structure.owner, key).toBe(side);
  }
}

/** Treasuries never go negative. */
export function expectTreasuryInvariants(state: GameState): void {
  for (const tile of centerTiles(state)) {
    const treasury = state.centers[tile]?.treasury;
    expect(treasury?.gold, `gold of ${tile}`).toBeGreaterThanOrEqual(0);
    expect(treasury?.food, `food of ${tile}`).toBeGreaterThanOrEqual(0);
    expect(treasury?.materials, `materials of ${tile}`).toBeGreaterThanOrEqual(0);
  }
}

/**
 * Asserts the player invariants (GDD 9.1, 11): an eliminated player owns nothing and never
 * plays; an advance goes to the next age, within v0.1's ages; statistics per player.
 */
export function expectPlayerInvariants(state: GameState): void {
  const last = AGES.indexOf(AGE_ADVANCE.lastAge);
  expect(state.players[state.currentPlayer]?.eliminated, 'player on turn').toBeNull();
  expect(state.stats).toHaveLength(state.players.length);
  state.players.forEach((player, id) => {
    expect(player.id).toBe(id);
    if (player.eliminated) {
      expect(state.owners.includes(id), `eliminated player ${id} owns tiles`).toBe(false);
      expect(player.advancing).toBeNull();
      expect(player.eliminated.by).not.toBe(id);
      expect(player.eliminated.round).toBeLessThanOrEqual(state.round);
    }
    if (player.advancing) {
      expect(player.advancing).toBe(nextAge(player.age));
      expect(AGES.indexOf(player.advancing)).toBeLessThanOrEqual(last);
    }
    const tiles = state.owners.filter((o) => o === id).length;
    expect(state.stats[id]?.peakTiles, `peak tiles of ${id}`).toBeGreaterThanOrEqual(tiles);
  });
  const active = activePlayers(state);
  expect(active.length).toBeGreaterThanOrEqual(1);
  expect(winnerOf(state)).toBe(active.length === 1 ? active[0] : null);
}

/**
 * In a game that started with a capital for every player (createGame), a player is in the
 * game exactly as long as they keep it (capitals only fall to conquest).
 */
export function expectCapitalInvariants(state: GameState): void {
  for (const player of state.players) {
    expect(capitalOf(state, player.id) !== undefined, `capital of ${player.id}`).toBe(
      player.eliminated === null,
    );
  }
}

/** All state invariants at once. */
export function expectInvariants(state: GameState): void {
  expectPlayerInvariants(state);
  expectCenterInvariants(state);
  expectUnitInvariants(state);
  expectBuildingInvariants(state);
  expectStructureInvariants(state);
  expectTreasuryInvariants(state);
}
