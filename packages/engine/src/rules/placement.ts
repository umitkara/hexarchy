import { UNITS } from '../balance';
import type { CommandError } from '../commands/types';
import type { GameState, PlayerId, Unit, UnitLine } from '../state/game';
import { isOwnable, mapGrid } from '../state/map';
import { movementArea, movementLinked, tilesAround } from './movement';
import { attackBlockers, protectorsOf, type Protector } from './protection';
import { getRegions, regionAt } from './regions';
import { levelCap, mergeUnits, newUnit } from './units';

/**
 * Where a unit can go (GDD 6.4, 7): one rule set for moving a unit and for placing a
 * bought one (Slay/Konkr), shared by validation, the UI's target highlights and the AI.
 *
 * - A unit on the map moves freely within its movement area (see movementArea), and
 *   bought units are placed anywhere in the paying region: onto an empty tile, or onto an
 *   own unit to merge (GDD 6.2).
 * - Either can also take one step outside, through the movement graph: onto a neutral
 *   tile (capture) or an enemy tile (attack), if no protector of the tile is as strong.
 */

/** The unit to place: one standing on `from`, or a new one bought from a region. */
export type UnitSource =
  | { readonly kind: 'unit'; readonly from: number }
  | { readonly kind: 'recruit'; readonly center: number; readonly line: UnitLine };

/** `move`: onto an empty own tile (for a bought unit: placed there). */
export type PlacementAction = 'move' | 'merge' | 'capture' | 'attack';

export interface Placement {
  readonly action: PlacementAction;
  readonly tile: number;
  /** The unit as it stands on `tile` afterwards. */
  readonly unit: Unit;
  /** The target's protectors (all beaten); empty unless attacking. */
  readonly defenders: readonly Protector[];
}

export type PlacementCheck =
  | { readonly ok: true; readonly placement: Placement }
  | {
      readonly ok: false;
      readonly error: CommandError;
      /** For `protected`: the protectors the unit does not beat. */
      readonly blockers?: readonly Protector[];
    };

/** A resolved source: whose unit it is and where it may go freely. */
export interface SourceInfo {
  readonly player: PlayerId;
  readonly unit: Unit;
  /** Tiles the unit reaches without leaving its owner's land. */
  readonly area: ReadonlySet<number>;
  /** Gold price (recruits only). */
  readonly cost: number;
}

export type SourceCheck =
  | { readonly ok: true; readonly info: SourceInfo }
  | { readonly ok: false; readonly error: CommandError };

type RulesState = Pick<
  GameState,
  'map' | 'owners' | 'centers' | 'units' | 'players' | 'currentPlayer'
>;

/** Checks that the current player may use the source right now. */
export function checkSource(state: RulesState, source: UnitSource): SourceCheck {
  const grid = mapGrid(state.map);
  const player = state.currentPlayer;
  if (source.kind === 'unit') {
    if (!grid.has(source.from)) return { ok: false, error: 'unknownTile' };
    const unit = state.units[source.from];
    if (!unit) return { ok: false, error: 'noUnit' };
    if (state.owners[source.from] !== player) return { ok: false, error: 'notYourUnit' };
    if (unit.exhausted) return { ok: false, error: 'exhausted' };
    return {
      ok: true,
      info: { player, unit, area: new Set(movementArea(state, source.from)), cost: 0 },
    };
  }

  if (!(UNITS as Partial<Record<string, unknown>>)[source.line]) {
    return { ok: false, error: 'unknownUnit' };
  }
  if (!grid.has(source.center)) return { ok: false, error: 'unknownTile' };
  const center = state.centers[source.center];
  if (!center) return { ok: false, error: 'noTreasury' };
  if (state.owners[source.center] !== player) return { ok: false, error: 'notYourRegion' };
  const { cost } = UNITS[source.line];
  if (center.treasury.gold < cost) return { ok: false, error: 'notEnoughGold' };
  const region = regionAt(getRegions(state), source.center);
  return {
    ok: true,
    info: { player, unit: newUnit(source.line), area: new Set(region?.tiles), cost },
  };
}

/** Where the source's unit would end up on `to`, or why it cannot go there. */
export function checkPlacement(state: RulesState, source: UnitSource, to: number): PlacementCheck {
  const checked = checkSource(state, source);
  if (!checked.ok) return checked;
  return checkTarget(state, source, checked.info, to);
}

/** `checkPlacement` for an already resolved source (saves work when checking many tiles). */
export function checkTarget(
  state: RulesState,
  source: UnitSource,
  info: SourceInfo,
  to: number,
): PlacementCheck {
  const grid = mapGrid(state.map);
  if (!grid.has(to)) return { ok: false, error: 'unknownTile' };
  const { player, unit, area } = info;
  if (source.kind === 'unit' && to === source.from) return { ok: false, error: 'noChange' };

  const owner = state.owners[to] ?? null;
  if (owner === player && area.has(to)) {
    const there = state.units[to];
    if (!there) return ok('move', to, unit, []);
    const merged = mergeUnits(unit, there, levelCap(state, player));
    if (!merged.ok) return merged;
    return ok('merge', to, merged.unit, []);
  }

  // One step outside the area, through the movement graph.
  const neighbors = grid.neighbors(to).filter((n) => area.has(n));
  if (neighbors.length === 0) return { ok: false, error: 'unreachable' };
  if (!neighbors.some((n) => movementLinked(state.map, n, to))) {
    return { ok: false, error: 'edgeBlocked' };
  }
  if (owner === player) return { ok: false, error: 'unreachable' };
  const terrain = state.map.tiles[to]?.terrain;
  if (terrain === undefined || !isOwnable(terrain)) return { ok: false, error: 'notOwnable' };
  if (!UNITS[unit.line].fights) return { ok: false, error: 'cannotCapture' };
  if (state.centers[to]?.kind === 'capital') return { ok: false, error: 'capitalLocked' };
  const blockers = attackBlockers(state, unit, to);
  if (blockers.length > 0) return { ok: false, error: 'protected', blockers };
  return ok(
    owner === null ? 'capture' : 'attack',
    to,
    { ...unit, exhausted: true },
    protectorsOf(state, to),
  );
}

function ok(
  action: PlacementAction,
  tile: number,
  unit: Unit,
  defenders: readonly Protector[],
): PlacementCheck {
  return { ok: true, placement: { action, tile, unit, defenders } };
}

export interface TargetOption {
  readonly tile: number;
  readonly check: PlacementCheck;
}

/**
 * Every tile worth considering for a source, ascending: its area (other than the unit's
 * own tile) and the tiles around it, including those behind rivers (`edgeBlocked`).
 * Empty if the source itself is not usable.
 */
export function targetOptions(state: RulesState, source: UnitSource): TargetOption[] {
  const checked = checkSource(state, source);
  if (!checked.ok) return [];
  const { info } = checked;
  const area = [...info.area];
  const around = tilesAround(state, area, info.player);
  const tiles = [...area, ...around.linked, ...around.blocked].sort((a, b) => a - b);
  return tiles
    .filter((tile) => source.kind !== 'unit' || tile !== source.from)
    .map((tile) => ({ tile, check: checkTarget(state, source, info, tile) }));
}
