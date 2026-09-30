import { UNITS } from '../balance';
import type { CommandError } from '../commands/types';
import { ageAtLeast, type GameState, type PlayerId, type Unit, type UnitLine } from '../state/game';
import { isOwnable, mapGrid } from '../state/map';
import { hasActiveBuilding } from './buildings';
import { movementArea, movementLinked, tilesAround } from './movement';
import { attackBlockers, protectorsOf, type Protector } from './protection';
import { getRegions, regionAt } from './regions';
import { levelCap, mergeUnits, newUnit, unitStrength } from './units';

/**
 * Where a unit can go (GDD 6.4, 7): one rule set for moving a unit and for placing a
 * bought one (Slay/Konkr), shared by validation, the UI's target highlights and the AI.
 *
 * - A unit on the map moves freely within its movement area (see movementArea), and
 *   bought units are placed anywhere in the paying region: onto an empty tile, or onto an
 *   own unit to merge (GDD 6.2). A line may need an active building in the paying region
 *   (infantry: barracks, GDD 4.2) and an age. Buildings do not block units.
 * - Either can also take one step outside, through the movement graph: onto a neutral
 *   tile (capture) or an enemy tile (attack), if no protector of the tile is as strong.
 * - Cavalry reaches two steps outside (GDD 6.4), through a tile without a unit that it
 *   could take as well (so a protected line stops it); only the target changes hands.
 * - Siege never takes a tile with a unit on it (GDD 7.2: strength 0 against units).
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
  /** The tile a two-step (cavalry) move passes; it does not change hands. */
  readonly via?: number;
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
  | 'map'
  | 'owners'
  | 'centers'
  | 'units'
  | 'buildings'
  | 'edgeStructures'
  | 'players'
  | 'currentPlayer'
>;

/** True if `player`'s age has unlocked the unit line (GDD 9.1). */
export function lineUnlocked(
  state: Pick<GameState, 'players'>,
  player: PlayerId,
  line: UnitLine,
): boolean {
  return ageAtLeast(state.players[player]?.age ?? 'dark', UNITS[line].age);
}

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
  if (!lineUnlocked(state, player, source.line)) return { ok: false, error: 'ageLocked' };
  const { cost, requires } = UNITS[source.line];
  const region = regionAt(getRegions(state), source.center);
  if (requires && !hasActiveBuilding(state, region?.tiles ?? [], requires)) {
    return { ok: false, error: 'needsBuilding' };
  }
  if (center.treasury.gold < cost) return { ok: false, error: 'notEnoughGold' };
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

  // One step outside the area, through the movement graph (cavalry: two).
  const neighbors = grid.neighbors(to).filter((n) => area.has(n));
  const direct = neighbors.some((n) => movementLinked(state, n, to, player));
  let via: number | undefined;
  if (!direct) {
    via = UNITS[unit.line].reach >= 2 ? passableVia(state, info, to) : undefined;
    if (via === undefined) {
      return { ok: false, error: neighbors.length > 0 ? 'edgeBlocked' : 'unreachable' };
    }
  }
  if (owner === player) return { ok: false, error: 'unreachable' };
  const target = checkTakeable(state, unit, to);
  if (!target.ok) return target;
  return {
    ok: true,
    placement: {
      action: owner === null ? 'capture' : 'attack',
      tile: to,
      unit: { ...unit, exhausted: true },
      defenders: protectorsOf(state, to),
      ...(via !== undefined && { via }),
    },
  };
}

/** Whether `unit` could take `tile` if it got there: terrain, capital, protection. */
function checkTakeable(state: RulesState, unit: Unit, tile: number): PlacementCheck | { ok: true } {
  const terrain = state.map.tiles[tile]?.terrain;
  if (terrain === undefined || !isOwnable(terrain)) return { ok: false, error: 'notOwnable' };
  if (!UNITS[unit.line].fights) return { ok: false, error: 'cannotCapture' };
  if (state.centers[tile]?.kind === 'capital') return { ok: false, error: 'capitalLocked' };
  const there = state.units[tile];
  const owner = state.owners[tile] ?? null;
  if (UNITS[unit.line].siege && there && owner !== null) {
    // Siege cannot take a tile with a unit on it, not even a worker (GDD 7.2).
    return {
      ok: false,
      error: 'protected',
      blockers: [{ kind: 'unit', tile, owner, strength: unitStrength(there), unit: there }],
    };
  }
  const blockers = attackBlockers(state, unit, tile);
  if (blockers.length > 0) return { ok: false, error: 'protected', blockers };
  return { ok: true };
}

/**
 * For a two-step move onto `to`: the lowest tile between the area and `to` that the unit
 * may pass — not its own, without a unit, one it could take itself — with both steps
 * through its movement graph. Undefined if there is none.
 */
function passableVia(state: RulesState, info: SourceInfo, to: number): number | undefined {
  const grid = mapGrid(state.map);
  const { player, unit, area } = info;
  const candidates = grid
    .neighbors(to)
    .filter(
      (m) =>
        !area.has(m) &&
        state.owners[m] !== player &&
        state.units[m] === undefined &&
        movementLinked(state, m, to, player) &&
        grid.neighbors(m).some((n) => area.has(n) && movementLinked(state, n, m, player)),
    )
    .sort((a, b) => a - b);
  return candidates.find((m) => checkTakeable(state, unit, m).ok);
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
 * own tile) and the tiles around it, including those behind cutting edges (`edgeBlocked`);
 * for cavalry also the ring beyond. Empty if the source itself is not usable.
 */
export function targetOptions(state: RulesState, source: UnitSource): TargetOption[] {
  const checked = checkSource(state, source);
  if (!checked.ok) return [];
  const { info } = checked;
  const grid = mapGrid(state.map);
  const area = [...info.area];
  const around = tilesAround(state, area, info.player);
  const tiles = new Set([...area, ...around.linked, ...around.blocked]);
  if (UNITS[info.unit.line].reach >= 2) {
    for (const t of around.linked) {
      for (const n of grid.neighbors(t)) if (state.owners[n] !== info.player) tiles.add(n);
    }
  }
  return [...tiles]
    .sort((a, b) => a - b)
    .filter((tile) => source.kind !== 'unit' || tile !== source.from)
    .map((tile) => ({ tile, check: checkTarget(state, source, info, tile) }));
}
