import { STRUCTURES, UNITS } from '../balance';
import type { CommandError } from '../commands/types';
import { edgeKey, type EdgeKey } from '../hex/edge';
import {
  ageAtLeast,
  type GameState,
  type PlayerId,
  type StructureKind,
  type Unit,
} from '../state/game';
import { isOwnable, mapGrid } from '../state/map';
import { naturalEdgeAt, structureAt } from './edgeState';
import { getRegions, regionAt, regionCenter } from './regions';

/**
 * Edge structures (GDD 3.2, 5.3, 7.4): building them with a worker, and breaking them.
 * One rule set for validation, the UI's edge highlights and the AI.
 *
 * Building: a worker of the player on turn (not exhausted) builds on one of the six edges
 * of its own tile, paid in materials from the treasury of the worker's region; it is done
 * at once and the worker is exhausted. Both tiles of the edge must be ownable land; the
 * other tile may belong to anyone. Bridges go on rivers, the rest on any other edge (fords
 * included). A wall may replace the player's own fence, a gate only the player's own wall
 * (full price; damage stays).
 *
 * Breaking: a unit of the player on turn (not exhausted) strikes another player's
 * structure on an edge of its tile and is exhausted. Siege adds one hit (a structure falls
 * at STRUCTURES[kind].hits; damage stays until then); other units of a structure's
 * `breakLevel` or more (Sv3+ against fences) break it at once.
 */

type RulesState = Pick<
  GameState,
  | 'map'
  | 'owners'
  | 'centers'
  | 'units'
  | 'buildings'
  | 'edgeStructures'
  | 'players'
  | 'currentPlayer'
>;

/** A structure to build with the worker on `from`. */
export interface EdgeBuildSource {
  readonly kind: 'edge';
  readonly from: number;
  readonly structure: StructureKind;
}

export interface EdgeBuildInfo {
  readonly player: PlayerId;
  /** Center tile of the worker's region, whose treasury pays. */
  readonly center: number;
  /** Materials price. */
  readonly cost: number;
}

export interface EdgeBuild {
  readonly edge: EdgeKey;
  readonly from: number;
  readonly to: number;
  readonly structure: StructureKind;
  /** The own structure it replaces (fence → wall, wall → gate), if any. */
  readonly replaces: StructureKind | null;
  /** Center tile of the paying region (the worker's). */
  readonly center: number;
  readonly cost: number;
}

export type EdgeBuildSourceCheck =
  | { readonly ok: true; readonly info: EdgeBuildInfo }
  | { readonly ok: false; readonly error: CommandError };

export type EdgeBuildCheck =
  | { readonly ok: true; readonly build: EdgeBuild }
  | { readonly ok: false; readonly error: CommandError };

export interface EdgeOption<Check> {
  /** The tile across the edge. */
  readonly to: number;
  readonly edge: EdgeKey;
  readonly check: Check;
}

/** True if `player`'s age has unlocked the structure (GDD 9.1). */
export function structureUnlocked(
  state: Pick<GameState, 'players'>,
  player: PlayerId,
  structure: StructureKind,
): boolean {
  return ageAtLeast(state.players[player]?.age ?? 'dark', STRUCTURES[structure].age);
}

/** A unit of the player on turn on `from` that may act now. */
function ownReadyUnit(
  state: RulesState,
  from: number,
):
  | { readonly ok: true; readonly unit: Unit }
  | { readonly ok: false; readonly error: CommandError } {
  if (!mapGrid(state.map).has(from)) return { ok: false, error: 'unknownTile' };
  const unit = state.units[from];
  if (!unit) return { ok: false, error: 'noUnit' };
  if (state.owners[from] !== state.currentPlayer) return { ok: false, error: 'notYourUnit' };
  if (unit.exhausted) return { ok: false, error: 'exhausted' };
  return { ok: true, unit };
}

/** Checks that the worker on `source.from` may build the structure right now. */
export function checkEdgeBuildSource(
  state: RulesState,
  source: EdgeBuildSource,
): EdgeBuildSourceCheck {
  if (!(STRUCTURES as Partial<Record<string, unknown>>)[source.structure]) {
    return { ok: false, error: 'unknownStructure' };
  }
  const ready = ownReadyUnit(state, source.from);
  if (!ready.ok) return ready;
  if (!UNITS[ready.unit.line].buildsEdges) return { ok: false, error: 'cannotBuildEdges' };
  const player = state.currentPlayer;
  if (!structureUnlocked(state, player, source.structure)) return { ok: false, error: 'ageLocked' };
  const region = regionAt(getRegions(state), source.from);
  const center = region && regionCenter(state, region);
  const treasury = center === undefined ? undefined : state.centers[center]?.treasury;
  if (center === undefined || !treasury) return { ok: false, error: 'noTreasury' };
  const { cost } = STRUCTURES[source.structure];
  if (treasury.materials < cost) return { ok: false, error: 'notEnoughMaterials' };
  return { ok: true, info: { player, center, cost } };
}

/** What building the source's structure on the edge towards `to` would do, or why not. */
export function checkEdgeBuild(
  state: RulesState,
  source: EdgeBuildSource,
  to: number,
): EdgeBuildCheck {
  const checked = checkEdgeBuildSource(state, source);
  if (!checked.ok) return checked;
  return checkEdgeBuildTarget(state, source, checked.info, to);
}

/** `checkEdgeBuild` for an already resolved source. */
export function checkEdgeBuildTarget(
  state: RulesState,
  source: EdgeBuildSource,
  info: EdgeBuildInfo,
  to: number,
): EdgeBuildCheck {
  const grid = mapGrid(state.map);
  const { from, structure } = source;
  if (!grid.has(to)) return { ok: false, error: 'unknownTile' };
  if (!grid.areAdjacent(from, to)) return { ok: false, error: 'notAdjacent' };
  const terrain = state.map.tiles[to]?.terrain;
  if (terrain === undefined || !isOwnable(terrain)) return { ok: false, error: 'notOwnable' };
  const spec = STRUCTURES[structure];
  const river = naturalEdgeAt(state, from, to)?.kind === 'river';
  if (spec.onRiver && !river) return { ok: false, error: 'needsRiver' };
  if (!spec.onRiver && river) return { ok: false, error: 'riverEdge' };
  const existing = structureAt(state, from, to);
  const upgrade = existing?.kind === spec.upgrades && existing.owner === info.player;
  if (spec.upgradeOnly && !upgrade) return { ok: false, error: 'needsWall' };
  if (existing && !upgrade) return { ok: false, error: 'edgeOccupied' };
  return {
    ok: true,
    build: {
      edge: edgeKey(from, to),
      from,
      to,
      structure,
      replaces: upgrade ? existing.kind : null,
      center: info.center,
      cost: info.cost,
    },
  };
}

/** The six edges of the worker's tile with their checks; empty if the source is unusable. */
export function edgeBuildOptions(
  state: RulesState,
  source: EdgeBuildSource,
): EdgeOption<EdgeBuildCheck>[] {
  const checked = checkEdgeBuildSource(state, source);
  if (!checked.ok) return [];
  return mapGrid(state.map)
    .neighbors(source.from)
    .map((to) => ({
      to,
      edge: edgeKey(source.from, to),
      check: checkEdgeBuildTarget(state, source, checked.info, to),
    }));
}

/** A unit on `from` striking a structure on one of its tile's edges. */
export interface BreachSource {
  readonly kind: 'breach';
  readonly from: number;
}

export interface Breach {
  readonly edge: EdgeKey;
  readonly from: number;
  readonly to: number;
  readonly structure: StructureKind;
  readonly owner: PlayerId;
  /** Damage after the blow. */
  readonly damage: number;
  readonly hits: number;
  readonly destroyed: boolean;
}

export type BreachCheck =
  | { readonly ok: true; readonly breach: Breach }
  | { readonly ok: false; readonly error: CommandError };

/** Lowest level at which a non-siege unit breaks some structure (fences: Sv3). */
const MIN_BREAK_LEVEL = Math.min(
  ...Object.values(STRUCTURES).map((s) => s.breakLevel ?? Number.POSITIVE_INFINITY),
);

/** True if the unit can break some structure: siege, or a high enough level. */
export function canBreach(unit: Unit): boolean {
  const line = UNITS[unit.line];
  return line.fights && (line.siege || unit.level >= MIN_BREAK_LEVEL);
}

/** Checks that the unit on `source.from` may strike now (the source part of checkBreach). */
export function checkBreachSource(
  state: RulesState,
  source: BreachSource,
):
  | { readonly ok: true; readonly unit: Unit }
  | { readonly ok: false; readonly error: CommandError } {
  const ready = ownReadyUnit(state, source.from);
  if (!ready.ok) return ready;
  if (!canBreach(ready.unit)) return { ok: false, error: 'cannotBreach' };
  return ready;
}

/** What striking the structure on the edge towards `to` would do, or why not. */
export function checkBreach(state: RulesState, source: BreachSource, to: number): BreachCheck {
  const checked = checkBreachSource(state, source);
  if (!checked.ok) return checked;
  return checkBreachTarget(state, source, checked.unit, to);
}

function checkBreachTarget(
  state: RulesState,
  source: BreachSource,
  unit: Unit,
  to: number,
): BreachCheck {
  const grid = mapGrid(state.map);
  const { from } = source;
  if (!grid.has(to)) return { ok: false, error: 'unknownTile' };
  if (!grid.areAdjacent(from, to)) return { ok: false, error: 'notAdjacent' };
  const structure = structureAt(state, from, to);
  if (!structure) return { ok: false, error: 'noStructure' };
  if (structure.owner === state.currentPlayer) return { ok: false, error: 'ownStructure' };
  const spec = STRUCTURES[structure.kind];
  let damage: number;
  if (UNITS[unit.line].siege) damage = structure.damage + 1;
  else if (spec.breakLevel !== null && unit.level >= spec.breakLevel) damage = spec.hits;
  else return { ok: false, error: 'cannotBreach' };
  return {
    ok: true,
    breach: {
      edge: edgeKey(from, to),
      from,
      to,
      structure: structure.kind,
      owner: structure.owner,
      damage,
      hits: spec.hits,
      destroyed: damage >= spec.hits,
    },
  };
}

/** The six edges of the unit's tile with their checks; empty if the unit cannot strike. */
export function breachOptions(state: RulesState, source: BreachSource): EdgeOption<BreachCheck>[] {
  const checked = checkBreachSource(state, source);
  if (!checked.ok) return [];
  return mapGrid(state.map)
    .neighbors(source.from)
    .map((to) => ({
      to,
      edge: edgeKey(source.from, to),
      check: checkBreachTarget(state, source, checked.unit, to),
    }));
}
