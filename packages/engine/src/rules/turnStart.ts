import { current, type Draft } from 'immer';
import { BUILDING_UPKEEP_ORDER, BUILDINGS, UPKEEP } from '../balance';
import {
  addResources,
  emptyResources,
  type BuildingKind,
  type GameState,
  type PlayerId,
  type Resources,
} from '../state/game';
import { buildingOutput } from './buildings';
import { regionGoldIncome } from './economy';
import type { GameEvent } from './events';
import { getRegions, regionCenter } from './regions';
import { removeUnit } from './upkeep';
import { unitUpkeep } from './units';

/**
 * The economy part of a player's turn start (GDD 2, 4), region by region:
 *
 * 1. Gold income: +gold of every owned tile, plus the output of buildings without upkeep
 *    (gold mines).
 * 2. Building upkeep in gold, in BUILDING_UPKEEP_ORDER (ties by tile). A building whose
 *    upkeep the gold no longer covers idles until the next turn start (gold shortfall):
 *    no output, no unlocked units, no protection. Cheaper ones later may still be paid.
 * 3. The paid buildings produce (food, materials).
 * 4. Unit upkeep in food. If the food falls short: the first time, the food drops to 0 and
 *    every unit of the region goes hungry (−1 strength). If a unit of the region is already
 *    hungry, units rebel instead — highest upkeep first, then lowest tile — until the rest
 *    can be fed; the rest are fed and no longer hungry.
 *
 * A region without a center (a lone tile) has no treasury: its income is lost, its
 * buildings cannot be paid and its units cannot be fed.
 *
 * `turnStartForecast` computes all of it without changing anything; `applyTurnStart` writes
 * exactly that forecast into the state. So the treasury panel's forecast and the real turn
 * start are one piece of code (forest spread, being random, is not part of it).
 */

export interface BuildingReport {
  readonly tile: number;
  readonly building: BuildingKind;
  readonly upkeep: number;
  /** Its upkeep is paid (or it has none): it works this turn. */
  readonly active: boolean;
  /** What it yields if active (zero otherwise). */
  readonly output: Resources;
}

export type FoodOutcome = 'fed' | 'starving' | 'rebellion';

export interface RegionTurnStart {
  readonly owner: PlayerId;
  /** Tiles of the region, ascending. */
  readonly tiles: readonly number[];
  /** Center tile, or undefined for a region without a treasury. */
  readonly center: number | undefined;
  /** Treasury before the turn start (empty without a treasury). */
  readonly before: Resources;
  /** Gold of the region's tiles. */
  readonly tileGold: number;
  /** The region's buildings in payment order. */
  readonly buildings: readonly BuildingReport[];
  /** Everything earned: tile gold plus the output of the working buildings. */
  readonly income: Resources;
  /** Gold paid for building upkeep. */
  readonly buildingUpkeep: number;
  /** Tiles of the buildings that idle for lack of gold. */
  readonly idle: readonly number[];
  /** Food the units eat (GDD 4.4). */
  readonly unitUpkeep: number;
  readonly food: FoodOutcome;
  /** Food actually paid for the units that remain. */
  readonly foodPaid: number;
  /** Units that rebel and die. */
  readonly rebels: readonly number[];
  /** Units that are hungry afterwards. */
  readonly hungry: readonly number[];
  /** Treasury afterwards (empty without a treasury). */
  readonly after: Resources;
}

type EconomyState = Pick<GameState, 'map' | 'owners' | 'centers' | 'units' | 'buildings'>;

/** What `player`'s turn start would do to each of their regions, in region order. */
export function turnStartForecast(state: EconomyState, player: PlayerId): RegionTurnStart[] {
  const forecast: RegionTurnStart[] = [];
  for (const region of getRegions(state).regions) {
    if (region.owner !== player) continue;
    const center = regionCenter(state, region);
    const treasury = center === undefined ? undefined : state.centers[center]?.treasury;
    const hasTreasury = treasury !== undefined;
    const before = treasury ?? emptyResources();
    const tileGold = regionGoldIncome(state.map, region);

    // 1-3: gold income, building upkeep, production.
    const owned = region.tiles
      .flatMap((tile) => {
        const building = state.buildings[tile];
        return building ? [{ tile, building: building.kind }] : [];
      })
      .sort(
        (a, b) =>
          BUILDING_UPKEEP_ORDER.indexOf(a.building) - BUILDING_UPKEEP_ORDER.indexOf(b.building) ||
          a.tile - b.tile,
      );
    const outputOf = (tile: number, building: BuildingKind) =>
      buildingOutput(state, tile, building, player);
    let gold = before.gold + tileGold;
    for (const { tile, building } of owned) {
      if (BUILDINGS[building].upkeep === 0) gold += outputOf(tile, building).gold;
    }
    if (!hasTreasury) gold = 0;
    let buildingUpkeep = 0;
    const reports: BuildingReport[] = owned.map(({ tile, building }) => {
      const { upkeep } = BUILDINGS[building];
      const active = upkeep === 0 || (hasTreasury && gold >= upkeep);
      if (active && upkeep > 0) {
        gold -= upkeep;
        buildingUpkeep += upkeep;
      }
      return {
        tile,
        building,
        upkeep,
        active,
        output: active ? outputOf(tile, building) : emptyResources(),
      };
    });
    let income: Resources = { gold: tileGold, food: 0, materials: 0 };
    for (const report of reports) income = addResources(income, report.output);

    // 4: food upkeep, starvation, rebellion.
    const units = region.tiles.flatMap((tile) => {
      const unit = state.units[tile];
      return unit ? [{ tile, unit, upkeep: unitUpkeep(unit) }] : [];
    });
    const unitUpkeepOwed = units.reduce((sum, u) => sum + u.upkeep, 0);
    const available = hasTreasury ? before[UPKEEP.resource] + income[UPKEEP.resource] : 0;
    let food: FoodOutcome = 'fed';
    let foodPaid = unitUpkeepOwed;
    let rebels: number[] = [];
    let hungry: number[] = [];
    if (available < unitUpkeepOwed) {
      if (units.some((u) => u.unit.hungry)) {
        food = 'rebellion';
        let remaining = unitUpkeepOwed;
        const byUpkeep = [...units].sort((a, b) => b.upkeep - a.upkeep || a.tile - b.tile);
        for (const u of byUpkeep) {
          if (remaining <= available) break;
          rebels.push(u.tile);
          remaining -= u.upkeep;
        }
        rebels = rebels.sort((a, b) => a - b);
        foodPaid = remaining;
      } else {
        food = 'starving';
        foodPaid = 0;
        hungry = units.map((u) => u.tile);
      }
    }

    const after: Resources = hasTreasury
      ? {
          ...addResources(before, income),
          gold: before.gold + income.gold - buildingUpkeep,
          [UPKEEP.resource]:
            food === 'starving' ? 0 : before[UPKEEP.resource] + income[UPKEEP.resource] - foodPaid,
        }
      : emptyResources();

    forecast.push({
      owner: player,
      tiles: region.tiles,
      center,
      before,
      tileGold,
      buildings: reports,
      income,
      buildingUpkeep,
      idle: reports.filter((r) => !r.active).map((r) => r.tile),
      unitUpkeep: unitUpkeepOwed,
      food,
      foodPaid,
      rebels,
      hungry,
      after,
    });
  }
  return forecast;
}

/** Runs the economy part of `player`'s turn start: exactly `turnStartForecast`. */
export function applyTurnStart(
  draft: Draft<GameState>,
  player: PlayerId,
  events: GameEvent[],
): void {
  for (const region of turnStartForecast(current(draft), player)) {
    const { center } = region;
    const centerOrNull = center ?? null;
    if (center !== undefined) {
      const holder = draft.centers[center];
      if (!holder) throw new Error(`No center on tile ${center}`);
      holder.treasury = { ...region.after };
      events.push({ type: 'income', player, center, income: region.income });
      if (region.buildingUpkeep > 0) {
        events.push({ type: 'buildingUpkeepPaid', player, center, amount: region.buildingUpkeep });
      }
    }
    for (const report of region.buildings) {
      const building = draft.buildings[report.tile];
      if (building) building.idle = !report.active;
    }
    if (region.idle.length > 0) {
      events.push({ type: 'buildingsIdle', player, center: centerOrNull, tiles: region.idle });
    }

    if (region.food === 'starving') {
      const lost = region.before[UPKEEP.resource] + region.income[UPKEEP.resource];
      events.push({
        type: 'starvation',
        player,
        center: centerOrNull,
        owed: region.unitUpkeep,
        lost: center === undefined ? 0 : lost,
        tiles: region.hungry,
      });
    } else if (region.food === 'rebellion') {
      events.push({
        type: 'rebellion',
        player,
        center: centerOrNull,
        owed: region.unitUpkeep,
        tiles: region.rebels,
      });
      for (const tile of region.rebels) {
        const unit = draft.units[tile];
        if (!unit) continue;
        events.push({
          type: 'unitKilled',
          tile,
          owner: player,
          unit: { ...unit },
          reason: 'rebellion',
        });
        removeUnit(draft, tile);
      }
    }
    if (center !== undefined && region.food !== 'starving' && region.foodPaid > 0) {
      events.push({
        type: 'upkeepPaid',
        player,
        center,
        resource: UPKEEP.resource,
        amount: region.foodPaid,
      });
    }
    const hungry = new Set(region.hungry);
    for (const tile of region.tiles) {
      const unit = draft.units[tile];
      if (unit) unit.hungry = hungry.has(tile);
    }
  }
}
