import { BUILDINGS, type BuildingYield } from '../balance';
import type { CommandError } from '../commands/types';
import {
  ageAtLeast,
  emptyResources,
  resourceAmount,
  type BuildingKind,
  type GameState,
  type PlayerId,
  type Resources,
} from '../state/game';
import { mapGrid } from '../state/map';
import { getRegions, regionAt } from './regions';

/**
 * Buildings (GDD 4.3, 5): where they may stand, what they yield, and the one rule set for
 * building them, shared by validation, the UI's target highlights and the AI.
 *
 * A building is bought instantly with materials from a region's treasury and placed on a
 * tile of that region (no worker needed, GDD 5): an own tile of the right terrain without a
 * building or center, in an age that has unlocked it.
 */

/** A building to place, paid from the treasury of the region whose center is on `center`. */
export interface BuildSource {
  readonly kind: 'build';
  readonly center: number;
  readonly building: BuildingKind;
}

export interface BuildPlacement {
  readonly tile: number;
  readonly building: BuildingKind;
  /** What it would yield per turn on that tile, as things stand (GDD 13: preview). */
  readonly output: Resources;
}

export type BuildCheck =
  | { readonly ok: true; readonly placement: BuildPlacement }
  | { readonly ok: false; readonly error: CommandError };

export interface BuildSourceInfo {
  readonly player: PlayerId;
  /** Tiles of the paying region. */
  readonly area: ReadonlySet<number>;
  /** Materials price. */
  readonly cost: number;
}

export type BuildSourceCheck =
  | { readonly ok: true; readonly info: BuildSourceInfo }
  | { readonly ok: false; readonly error: CommandError };

type RulesState = Pick<
  GameState,
  'map' | 'owners' | 'centers' | 'units' | 'buildings' | 'players' | 'currentPlayer'
>;

/** True if `player`'s age has unlocked the building (GDD 9.1). */
export function buildingUnlocked(
  state: Pick<GameState, 'players'>,
  player: PlayerId,
  building: BuildingKind,
): boolean {
  return ageAtLeast(state.players[player]?.age ?? 'dark', BUILDINGS[building].age);
}

/**
 * What a building of this kind on `tile`, owned by `owner`, yields per turn (GDD 4.3):
 * its base plus one amount per qualifying neighbor. Ignores upkeep (see turnStart).
 */
export function buildingOutput(
  state: Pick<GameState, 'map' | 'owners'>,
  tile: number,
  building: BuildingKind,
  owner: PlayerId,
): Resources {
  const spec: BuildingYield | null = BUILDINGS[building].yield;
  if (!spec) return emptyResources();
  let amount = spec.base;
  for (const n of mapGrid(state.map).neighbors(tile)) {
    const terrain = state.map.tiles[n]?.terrain;
    const rule = terrain === undefined ? undefined : spec.neighbors[terrain];
    if (rule && (!rule.owned || state.owners[n] === owner)) amount += rule.amount;
  }
  return resourceAmount(spec.resource, amount);
}

/** Checks that the current player may pay for the building from the region right now. */
export function checkBuildSource(state: RulesState, source: BuildSource): BuildSourceCheck {
  const grid = mapGrid(state.map);
  const player = state.currentPlayer;
  if (!(BUILDINGS as Partial<Record<string, unknown>>)[source.building]) {
    return { ok: false, error: 'unknownBuilding' };
  }
  if (!grid.has(source.center)) return { ok: false, error: 'unknownTile' };
  const center = state.centers[source.center];
  if (!center) return { ok: false, error: 'noTreasury' };
  if (state.owners[source.center] !== player) return { ok: false, error: 'notYourRegion' };
  if (!buildingUnlocked(state, player, source.building)) return { ok: false, error: 'ageLocked' };
  const { cost } = BUILDINGS[source.building];
  if (center.treasury.materials < cost) return { ok: false, error: 'notEnoughMaterials' };
  const region = regionAt(getRegions(state), source.center);
  return { ok: true, info: { player, area: new Set(region?.tiles), cost } };
}

/** What building the source on `tile` would give, or why it cannot go there. */
export function checkBuild(state: RulesState, source: BuildSource, tile: number): BuildCheck {
  const checked = checkBuildSource(state, source);
  if (!checked.ok) return checked;
  return checkBuildTarget(state, source, checked.info, tile);
}

/** `checkBuild` for an already resolved source (saves work when checking many tiles). */
export function checkBuildTarget(
  state: RulesState,
  source: BuildSource,
  info: BuildSourceInfo,
  tile: number,
): BuildCheck {
  const grid = mapGrid(state.map);
  if (!grid.has(tile)) return { ok: false, error: 'unknownTile' };
  if (!info.area.has(tile)) return { ok: false, error: 'outsideRegion' };
  if (state.buildings[tile] || state.centers[tile]) return { ok: false, error: 'tileOccupied' };
  const spec = BUILDINGS[source.building];
  const land = state.map.tiles[tile];
  if (!land || !(spec.terrain as readonly string[]).includes(land.terrain)) {
    return { ok: false, error: 'wrongTerrain' };
  }
  if (spec.vein && !land.vein) return { ok: false, error: 'needsVein' };
  if (
    spec.nextToForest &&
    !grid.neighbors(tile).some((n) => state.map.tiles[n]?.terrain === 'forest')
  ) {
    return { ok: false, error: 'needsForest' };
  }
  return {
    ok: true,
    placement: {
      tile,
      building: source.building,
      output: buildingOutput(state, tile, source.building, info.player),
    },
  };
}

export interface BuildOption {
  readonly tile: number;
  readonly check: BuildCheck;
}

/** Every tile of the paying region with its check, ascending; empty if the source is unusable. */
export function buildOptions(state: RulesState, source: BuildSource): BuildOption[] {
  const checked = checkBuildSource(state, source);
  if (!checked.ok) return [];
  return [...checked.info.area]
    .sort((a, b) => a - b)
    .map((tile) => ({ tile, check: checkBuildTarget(state, source, checked.info, tile) }));
}

/** True if one of `tiles` holds an active (not idle) building of this kind. */
export function hasActiveBuilding(
  state: Pick<GameState, 'buildings'>,
  tiles: Iterable<number>,
  building: BuildingKind,
): boolean {
  for (const tile of tiles) {
    const there = state.buildings[tile];
    if (there?.kind === building && !there.idle) return true;
  }
  return false;
}
