import { AI, BUILDINGS, UNITS, type BuildingYield } from '../balance';
import type { EdgeKey } from '../hex/edge';
import { buildingOutput, hasActiveBuilding, type BuildPlacement } from '../rules/buildings';
import { movementLinked } from '../rules/movement';
import { protectorsOf } from '../rules/protection';
import { NO_REGION } from '../rules/regions';
import { treasuryLinked } from '../rules/treasuryGraph';
import { unitUpkeep } from '../rules/units';
import {
  UNIT_LINES,
  type Building,
  type BuildingKind,
  type Center,
  type PlayerId,
  type Resources,
  type Unit,
  type UnitLine,
} from '../state/game';
import {
  landWorth,
  riskOf,
  strongest,
  tileWorth,
  unitWorth,
  type AiView,
  type RegionEconomy,
} from './view';

/**
 * Scoring of candidate commands (GDD 12). Every score is in points (≈ gold): what the
 * command gains, less what it costs and the change in expected losses (risk) it causes.
 */

/** A hypothetical change around a few tiles, to measure its effect on risk. */
export interface Change {
  /** A unit leaves this tile. */
  readonly vacate?: number;
  /** This unit stands on this tile afterwards (moved, bought or merged). */
  readonly place?: { readonly tile: number; readonly unit: Unit };
  /** This tile becomes the player's. */
  readonly take?: number;
  /** A building goes up here (a tower protects). */
  readonly build?: { readonly tile: number; readonly kind: BuildingKind };
}

/** Tiles within two steps of `tile` (the widest protection radius). */
function nearby(view: AiView, tile: number, into: Set<number>): void {
  into.add(tile);
  for (const n of view.grid.neighbors(tile)) {
    into.add(n);
    for (const m of view.grid.neighbors(n)) into.add(m);
  }
}

/**
 * How much the expected losses of own tiles grow with `change` (negative: they shrink).
 * Only tiles near the change are re-examined; enemy threats are taken as they are now.
 */
export function riskDelta(view: AiView, change: Change): number {
  const { state, player } = view;
  const affected = new Set<number>();
  for (const tile of [change.vacate, change.place?.tile, change.take, change.build?.tile]) {
    if (tile !== undefined) nearby(view, tile, affected);
  }
  const units: Record<number, Unit | undefined> = { ...state.units };
  if (change.vacate !== undefined) units[change.vacate] = undefined;
  if (change.place) units[change.place.tile] = change.place.unit;
  let owners = state.owners;
  let centers: Readonly<Partial<Record<number, Center>>> = state.centers;
  let takenWorth = 0;
  if (change.take !== undefined) {
    const taken = change.take;
    owners = owners.slice();
    (owners as (PlayerId | null)[])[taken] = player;
    if (centers[taken]) centers = { ...centers, [taken]: undefined };
    const building = state.buildings[taken];
    takenWorth =
      landWorth(state, taken) +
      (building ? BUILDINGS[building.kind].cost * AI.buildingPerMaterial : 0);
  }
  const buildings: Readonly<Partial<Record<number, Building>>> = change.build
    ? { ...state.buildings, [change.build.tile]: { kind: change.build.kind, idle: false } }
    : state.buildings;
  const sketch = { ...state, owners, centers, units, buildings };

  let delta = 0;
  for (const tile of affected) {
    delta -= view.risk[tile] ?? 0;
    if (owners[tile] !== player) continue;
    const worth =
      (tile === change.take ? takenWorth : (view.baseWorth[tile] ?? 0)) + unitWorth(units[tile]);
    const protection = strongest(protectorsOf(sketch, tile));
    delta += riskOf(view, worth, view.threat[tile] ?? 0, protection);
  }
  return delta;
}

/** Food per turn is worth more while the region's food balance is low (GDD 4.4, 4.5). */
export function foodValue(view: AiView, economy: RegionEconomy): number {
  const { food } = AI;
  // Without a building to buy soldiers, food only needs to feed what is already there.
  const soldiers = UNIT_LINES.some((line) => {
    const { fights, requires } = UNITS[line];
    return fights && hasActiveBuilding(view.state, economy.region.tiles, requires);
  });
  const value =
    economy.foodNet < 0
      ? food.deficit
      : economy.foodNet < food.comfortNet && soldiers
        ? food.low
        : food.surplus;
  return economy.shortfall.food > 0 ? value * AI.age.savingBoost : value;
}

export function materialsValue(economy: RegionEconomy): number {
  const { materials } = AI;
  const value =
    economy.materialsIncome <= 0
      ? materials.none
      : economy.materialsIncome < materials.plentyIncome
        ? materials.low
        : materials.plenty;
  return economy.shortfall.materials > 0 ? value * AI.age.savingBoost : value;
}

export function resourceValue(
  view: AiView,
  economy: RegionEconomy,
  resource: keyof Resources,
): number {
  if (resource === 'food') return foodValue(view, economy);
  if (resource === 'materials') return materialsValue(economy);
  return AI.goldPerTurn;
}

/** The economy of the own region holding `tile`, if it has a treasury. */
export function economyAt(view: AiView, tile: number): RegionEconomy | undefined {
  return view.economy.get(view.regions.regionOf[tile] ?? NO_REGION);
}

/**
 * Whether a region can feed `extra` more food of unit upkeep per turn: its next turn
 * start must not starve, and a deficit must be covered by the stock for a few turns. While
 * saving for the next age the capital region runs no deficit at all.
 */
export function canFeed(view: AiView, economy: RegionEconomy, extra: number): boolean {
  if (extra <= 0) return true;
  const { forecast } = economy;
  if (forecast.food !== 'fed') return false;
  const owed = forecast.unitUpkeep + extra;
  const stock = forecast.before.food + forecast.income.food - owed;
  if (stock < 0) return false;
  const net = forecast.income.food - owed;
  if (net >= 0) return true;
  if (economy.capital && view.saving) return false;
  return stock + net * AI.foodLookahead >= 0;
}

/**
 * Resources piling up unused are worth less: spending from a stock above `AI.wealth.stock`
 * costs proportionally less, down to `AI.wealth.floor` of the usual price.
 */
function wealth(stock: number): number {
  const { stock: rich, floor } = AI.wealth;
  return stock <= rich ? 1 : Math.max(floor, rich / stock);
}

/** Points of `amount` more food upkeep per turn for the region. */
export function upkeepCost(economy: RegionEconomy, amount: number): number {
  return Math.max(0, amount) * AI.upkeep * wealth(economy.treasury.food);
}

/** Points of spending `amount` materials from the region's treasury. */
export function materialsCost(economy: RegionEconomy, amount: number): number {
  return amount * AI.materialSpend * wealth(economy.treasury.materials);
}

/**
 * Points a purchase costs — gold spent and extra upkeep — or null if the region cannot
 * pay it (the age savings are only touched in an emergency) or feed it.
 */
export function purchaseCost(
  view: AiView,
  economy: RegionEconomy,
  line: UnitLine,
  extraUpkeep: number,
  emergency: boolean,
): number | null {
  const { cost } = UNITS[line];
  const gold = emergency ? economy.treasury.gold : economy.spendable.gold;
  if (gold < cost) return null;
  if (!canFeed(view, economy, extraUpkeep)) return null;
  return cost * AI.goldSpend * wealth(economy.treasury.gold) + upkeepCost(economy, extraUpkeep);
}

/**
 * What `owner` loses with a tile, unit included; an enemy capital eliminates them.
 * Memoized per view.
 */
const enemyWorthCache = new WeakMap<AiView, Map<number, number>>();
export function enemyWorth(view: AiView, tile: number): number {
  let cache = enemyWorthCache.get(view);
  if (!cache) {
    cache = new Map();
    enemyWorthCache.set(view, cache);
  }
  const cached = cache.get(tile);
  if (cached !== undefined) return cached;
  const { state } = view;
  const owner = state.owners[tile] ?? null;
  let worth = 0;
  if (owner !== null && owner !== view.player) {
    worth =
      state.centers[tile]?.kind === 'capital'
        ? AI.eliminate
        : tileWorth(state, view.regions, owner, tile) + unitWorth(state.units[tile]);
  }
  cache.set(tile, worth);
  return worth;
}

/**
 * What taking `tile` gains apart from risk: its land, a building that changes hands, own
 * buildings next to it that yield more, compactness, joined regions, and the enemy's loss.
 */
export function takeGain(view: AiView, tile: number): number {
  const { state, player, grid, personality } = view;
  const owner = state.owners[tile] ?? null;
  let gain = landWorth(state, tile);
  const building = state.buildings[tile];
  if (building && owner !== null) gain += BUILDINGS[building.kind].cost * AI.buildingPerMaterial;
  const terrain = state.map.tiles[tile]?.terrain;
  const joined = new Map<number, number>();
  let ownNeighbors = 0;
  for (const n of grid.neighbors(tile)) {
    if (state.owners[n] !== player) continue;
    ownNeighbors++;
    const there = state.buildings[n];
    const spec: BuildingYield | null = there ? BUILDINGS[there.kind].yield : null;
    const rule = spec && terrain ? spec.neighbors[terrain] : undefined;
    const economy = economyAt(view, n);
    if (rule?.owned && spec && economy) {
      gain += rule.amount * resourceValue(view, economy, spec.resource) * AI.neighborYieldTurns;
    }
    const region = view.regions.regionOf[n] ?? NO_REGION;
    if (region !== NO_REGION && treasuryLinked(state, n, tile)) {
      joined.set(region, view.regions.regions[region]?.tiles.length ?? 0);
    }
  }
  gain += ownNeighbors * AI.tile.compact;
  if (joined.size >= 2) {
    const sizes = [...joined.values()].sort((a, b) => b - a);
    const smaller = sizes.slice(1).reduce((sum, s) => sum + s, 0);
    gain += AI.tile.join + smaller * AI.tile.joinPerTile;
  }
  gain *= owner === null ? personality.expansion : 1;
  if (owner !== null) gain += enemyWorth(view, tile) * AI.harm * personality.aggression;
  return gain;
}

/**
 * Own movement areas at this step: component per own tile, and per component the tiles
 * one step out (through the movement graph) and its strongest fighting unit.
 */
export interface OwnAreas {
  readonly component: Int32Array;
  readonly around: readonly (readonly number[])[];
  /** Levels of each component's fighting units, strongest first. */
  readonly levels: readonly (readonly number[])[];
}

const areasCache = new WeakMap<AiView, OwnAreas>();
export function ownAreas(view: AiView): OwnAreas {
  const cached = areasCache.get(view);
  if (cached) return cached;
  const { state, grid, player } = view;
  const component = new Int32Array(grid.tileCount).fill(-1);
  const around: number[][] = [];
  const levels: number[][] = [];
  for (let start = 0; start < grid.tileCount; start++) {
    if (state.owners[start] !== player || component[start] !== -1) continue;
    const id = around.length;
    const tiles = [start];
    const out = new Set<number>();
    const found: number[] = [];
    component[start] = id;
    for (const t of tiles) {
      const unit = state.units[t];
      if (unit && UNITS[unit.line].fights && !UNITS[unit.line].siege) found.push(unit.level);
      for (const n of grid.neighbors(t)) {
        if (!movementLinked(state, t, n, player)) continue;
        if (state.owners[n] !== player) {
          out.add(n);
          continue;
        }
        if (component[n] !== -1) continue;
        component[n] = id;
        tiles.push(n);
      }
    }
    around.push([...out].sort((a, b) => a - b));
    levels.push(found.sort((a, b) => b - a));
  }
  const areas = { component, around, levels };
  areasCache.set(view, areas);
  return areas;
}

/**
 * What merging into a unit of level `level` on `tile` opens up for the next turn: the best
 * enemy tile next to its area that no own unit there could take yet (`target`), and its
 * gain times `mergeFuture` (`value`, 0 if none).
 */
export interface MergeFuture {
  readonly value: number;
  readonly target: number | undefined;
}

const NO_FUTURE: MergeFuture = { value: 0, target: undefined };
const futureCache = new WeakMap<AiView, Map<string, MergeFuture>>();
export function mergeOutlook(view: AiView, tile: number, level: number): MergeFuture {
  const areas = ownAreas(view);
  const id = areas.component[tile] ?? -1;
  if (id < 0) return NO_FUTURE;
  let cache = futureCache.get(view);
  if (!cache) {
    cache = new Map();
    futureCache.set(view, cache);
  }
  const key = `${id}:${level}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const future = computeMergeFuture(view, id, level);
  cache.set(key, future);
  return future;
}

export function mergeFuture(view: AiView, tile: number, level: number): number {
  return mergeOutlook(view, tile, level).value;
}

function computeMergeFuture(view: AiView, id: number, level: number): MergeFuture {
  const areas = ownAreas(view);
  // Enemy tiles next to the area a unit of `level` could take, best first.
  const targets: { tile: number; needed: number; gain: number }[] = [];
  for (const t of areas.around[id] ?? []) {
    if ((view.state.owners[t] ?? null) === null) continue;
    const needed = (view.protection[t] ?? 0) + 1;
    if (needed > level) continue;
    targets.push({ tile: t, needed, gain: takeGain(view, t) });
  }
  targets.sort((a, b) => b.gain - a.gain || a.tile - b.tile);
  // Every unit takes one tile a turn: the strongest ones claim the best tiles they can take;
  // the merge is worth the best tile left over.
  const free = [...(areas.levels[id] ?? [])];
  for (const target of targets) {
    const unit = free.findIndex((l) => l >= target.needed);
    if (unit >= 0) {
      free.splice(unit, 1);
      continue;
    }
    if (target.gain <= 0) break;
    return { value: target.gain * AI.mergeFuture, target: target.tile };
  }
  return NO_FUTURE;
}

/** Extra food upkeep of a merge (GDD 4.4: merging always costs more). */
export function mergeUpkeep(merged: Unit, ...parts: Unit[]): number {
  return unitUpkeep(merged) - parts.reduce((sum, u) => sum + unitUpkeep(u), 0);
}

/** A building's own value per kind, beyond what it yields; null if the region needs none. */
function buildingSpecial(
  view: AiView,
  economy: RegionEconomy,
  kind: BuildingKind,
  tile: number,
): number | null {
  const { state } = view;
  const tiles = economy.region.tiles;
  const has = (k: BuildingKind) => tiles.some((t) => state.buildings[t]?.kind === k);
  const size = tiles.length >= AI.militaryMinTiles ? 1 : 1 / 3;
  switch (kind) {
    case 'barracks':
      return has('barracks') ? null : AI.barracks * size;
    case 'archeryRange': {
      if (has('archeryRange')) return null;
      const threatened = tiles.some((t) => (view.risk[t] ?? 0) > 0);
      return (
        AI.archeryRange * size * (has('barracks') ? 1 : 0.4) + (threatened ? AI.archeryRange : 0)
      );
    }
    case 'stable':
      return has('stable') ? null : AI.stable * size;
    case 'workshop': {
      if (has('workshop')) return null;
      // Only worth it with enemy structures in reach.
      const structures = Object.entries(state.edgeStructures).some(
        ([key, s]) => s && s.owner !== view.player && edgeNearOwn(view, key as EdgeKey),
      );
      return structures ? AI.workshop * size : null;
    }
    case 'tower':
      return -riskDelta(view, { build: { tile, kind } });
    default:
      return 0;
  }
}

function edgeNearOwn(view: AiView, key: EdgeKey): boolean {
  return key
    .split('_')
    .map(Number)
    .some((t) => view.grid.neighbors(t).some((n) => view.state.owners[n] === view.player));
}

/**
 * Score of a building on a tile (GDD 4.3: the neighborhood puzzle): what it yields per
 * turn, weighed by what the region needs, over `buildHorizon` turns, less its price and
 * upkeep; military buildings for what they unlock, towers for the risk they remove.
 * Null if it makes no sense here.
 */
export function buildScore(
  view: AiView,
  economy: RegionEconomy,
  placement: BuildPlacement,
): number | null {
  const { building: kind, tile, output } = placement;
  const spec = BUILDINGS[kind];
  // An unpaid building idles: the region's gold must cover the extra upkeep.
  if (spec.upkeep > 0 && economy.goldNet < spec.upkeep) return null;
  const special = buildingSpecial(view, economy, kind, tile);
  if (special === null) return null;
  const perTurn =
    output.food * foodValue(view, economy) +
    output.materials * materialsValue(economy) +
    (output.gold - spec.upkeep) * AI.goldPerTurn;
  if (spec.yield && perTurn <= 0) return null;
  let score = perTurn * AI.buildHorizon - materialsCost(economy, spec.cost) + special;
  // Military buildings and towers leave good farm sites to farms.
  if (!spec.yield) score -= farmSite(view, tile) * AI.farmSiteLoss;
  if ((view.risk[tile] ?? 0) > 0) score -= spec.cost * AI.buildingPerMaterial * AI.risk;
  return score;
}

/** Food a farm on `tile` would yield (0 where no farm may stand). */
function farmSite(view: AiView, tile: number): number {
  const terrain = view.state.map.tiles[tile]?.terrain;
  if (!terrain || !(BUILDINGS.farm.terrain as readonly string[]).includes(terrain)) return 0;
  return buildingOutput(view.state, tile, 'farm', view.player).food;
}
