import { AI, BUILDINGS, ECONOMY, HUNGER, UNITS } from '../balance';
import type { HexGrid } from '../hex/grid';
import { advanceTarget, ageCost } from '../rules/ages';
import { hasActiveBuilding } from '../rules/buildings';
import { movementLinked } from '../rules/movement';
import { lineUnlocked } from '../rules/placement';
import { protectorsOf } from '../rules/protection';
import { getRegions, NO_REGION, type Region, type RegionMap } from '../rules/regions';
import { treasuryLinked } from '../rules/treasuryGraph';
import { turnStartForecast, type RegionTurnStart } from '../rules/turnStart';
import { deriveSeed, Rng } from '../rng';
import {
  activePlayers,
  capitalOf,
  emptyResources,
  UNIT_LINES,
  type GameState,
  type PlayerId,
  type Resources,
  type Unit,
} from '../state/game';
import { mapGrid } from '../state/map';

/**
 * What the AI knows about the game at one step of its turn (GDD 12): the economy of its
 * regions, how strong the enemies could strike each tile next turn (threat), how well its
 * own tiles are protected, what each tile is worth and which of them are at risk. Derived
 * from the state alone, recomputed after every command.
 */

/** Scales of one AI's scoring: its personality, seeded from the map (GDD 12). */
export interface Personality {
  /** Enemy losses and attacks. */
  readonly aggression: number;
  /** Neutral land and new units. */
  readonly expansion: number;
  /** Own tiles at risk. */
  readonly caution: number;
}

export function personalityOf(state: Pick<GameState, 'map'>, player: PlayerId): Personality {
  const rng = Rng.fromSeed(deriveSeed(state.map.seed, `ai:${player}`));
  const scale = () => 1 + (rng.float() * 2 - 1) * AI.personalitySpread;
  return { aggression: scale(), expansion: scale(), caution: scale() };
}

/** One own region with a treasury. */
export interface RegionEconomy {
  readonly region: Region;
  readonly center: number;
  readonly capital: boolean;
  readonly treasury: Resources;
  /** What its next turn start would do, as things stand (see turnStartForecast). */
  readonly forecast: RegionTurnStart;
  /** What may be spent now: the treasury less the age savings (capital region, saving). */
  readonly spendable: Resources;
  /**
   * What the age savings still lack (capital region, saving; zero otherwise): only these
   * resources are worth more while saving, and only their producers may use the savings.
   */
  readonly shortfall: Resources;
  /** Food per turn after unit upkeep. */
  readonly foodNet: number;
  /** Gold per turn after building upkeep. */
  readonly goldNet: number;
  readonly materialsIncome: number;
}

export interface AiView {
  readonly state: GameState;
  readonly player: PlayerId;
  readonly grid: HexGrid;
  readonly personality: Personality;
  readonly regions: RegionMap;
  /** Own regions with a treasury, by region id. */
  readonly economy: ReadonlyMap<number, RegionEconomy>;
  /** Saving up for the next age in the capital region. */
  readonly saving: boolean;
  /**
   * Per tile: the strongest unit an enemy could take it with on their next turn (moving a
   * unit one step out, or buying one there); 0 if none.
   */
  readonly threat: Int8Array;
  /** Per tile: its strongest protector for its owner (0 = unprotected). */
  readonly protection: Int8Array;
  /** Per own tile: what losing it costs, without its unit. */
  readonly baseWorth: Float64Array;
  /** Per own tile: expected loss if at risk (threat beats protection), else 0. */
  readonly risk: Float64Array;
  readonly totalRisk: number;
  /** Own tiles at risk, ascending. */
  readonly atRisk: readonly number[];
  /** Movement component of every enemy tile (-1 otherwise) and the strongest unit in it. */
  readonly enemyComponent: Int32Array;
  readonly componentStrength: readonly number[];
  /** Enemy components' strongest siege unit (it takes only tiles without units). */
  readonly componentSiege: readonly number[];
  /** Per region id: level of a fighter its owner could buy there next turn (enemies only). */
  readonly regionBuy: Int8Array;
  /** Per tile: strongest enemy cavalry reaching it with a two-step move. */
  readonly cavalryThreat: Int8Array;
}

/** Strength a unit will have on its owner's next turn: level less hunger (volleys wear off). */
export function nextTurnStrength(unit: Unit): number {
  return Math.max(0, unit.level - (unit.hungry ? HUNGER.strengthPenalty : 0));
}

export function unitWorth(unit: Unit | undefined): number {
  if (!unit) return 0;
  return UNITS[unit.line].fights ? AI.unitPerLevel * unit.level : AI.worker;
}

/** Worth of owning a tile for its land alone. */
export function landWorth(state: Pick<GameState, 'map'>, tile: number): number {
  const land = state.map.tiles[tile];
  if (!land) return 0;
  const gold = ECONOMY.tileGold[land.terrain];
  let worth = gold * AI.tile.perGold;
  if (land.terrain === 'forest') worth += AI.tile.forest;
  if (land.vein) worth += AI.tile.vein;
  return worth;
}

/** Tiles of `region` no longer linked to `center` once `lost` is gone (a split, GDD 4.2). */
export function cutOff(
  state: Pick<GameState, 'map' | 'edgeStructures'>,
  regions: RegionMap,
  region: Region,
  center: number,
  lost: number,
): number {
  const grid = mapGrid(state.map);
  const seen = new Set([center, lost]);
  const queue = [center];
  for (const tile of queue) {
    for (const n of grid.neighbors(tile)) {
      if (seen.has(n) || regions.regionOf[n] !== region.id) continue;
      if (!treasuryLinked(state, tile, n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return region.tiles.length - queue.length - 1;
}

function treasuryWorth(treasury: Resources): number {
  return (treasury.gold + treasury.food + treasury.materials) * AI.centerTreasury;
}

/**
 * What `owner` loses with `tile`, apart from its unit: the land, its building, its center
 * (the capital: everything) and the tiles cut off from their center.
 */
export function tileWorth(
  state: GameState,
  regions: RegionMap,
  owner: PlayerId,
  tile: number,
): number {
  const center = state.centers[tile];
  if (center?.kind === 'capital') return AI.capital;
  const building = state.buildings[tile];
  let worth = landWorth(state, tile);
  if (building) worth += BUILDINGS[building.kind].cost * AI.buildingPerMaterial;
  const region = regions.regions[regions.regionOf[tile] ?? NO_REGION];
  if (region?.owner !== owner) return worth;
  if (center) {
    return worth + treasuryWorth(center.treasury) + AI.centerPerTile * region.tiles.length;
  }
  const home = region.tiles.find((t) => state.centers[t] !== undefined);
  if (home !== undefined) worth += AI.splitPerTile * cutOff(state, regions, region, home, tile);
  return worth;
}

/** The strongest protector strength in a list (0 if none). */
export function strongest(protectors: readonly { readonly strength: number }[]): number {
  let best = 0;
  for (const p of protectors) best = Math.max(best, p.strength);
  return best;
}

/**
 * The strongest enemy that could take `tile` on its next turn, ignoring the enemy tile
 * `blocked` (a fence being considered there). Counter bonuses are left out.
 */
export function threatAt(view: AiView, tile: number, blocked?: number): number {
  const { state, grid, player } = view;
  let best = blocked === undefined ? (view.cavalryThreat[tile] ?? 0) : 0;
  const occupied = state.units[tile] !== undefined;
  for (const n of grid.neighbors(tile)) {
    if (n === blocked) continue;
    const owner = state.owners[n] ?? null;
    if (owner === null || owner === player) continue;
    const component = view.enemyComponent[n] ?? -1;
    if (component < 0 || !movementLinked(state, n, tile, owner)) continue;
    best = Math.max(best, view.componentStrength[component] ?? 0);
    if (!occupied) best = Math.max(best, view.componentSiege[component] ?? 0);
    best = Math.max(best, view.regionBuy[view.regions.regionOf[n] ?? NO_REGION] ?? 0);
  }
  return best;
}

/** Builds the AI's view of `state` for the player on turn. */
export function analyze(state: GameState, personality?: Personality): AiView {
  const player = state.currentPlayer;
  const grid = mapGrid(state.map);
  const regions = getRegions(state);
  const tileCount = grid.tileCount;
  const enemies = new Set(activePlayers(state).filter((p) => p !== player));

  // Enemy movement components: what each could strike with next turn.
  const enemyComponent = new Int32Array(tileCount).fill(-1);
  const componentStrength: number[] = [];
  const componentSiege: number[] = [];
  const componentCavalry: number[] = [];
  const componentTiles: number[][] = [];
  for (let start = 0; start < tileCount; start++) {
    const owner = state.owners[start] ?? null;
    if (owner === null || !enemies.has(owner) || enemyComponent[start] !== -1) continue;
    const id = componentTiles.length;
    const tiles = [start];
    enemyComponent[start] = id;
    let strength = 0;
    let siege = 0;
    let cavalry = 0;
    for (const t of tiles) {
      const unit = state.units[t];
      if (unit && UNITS[unit.line].fights) {
        const s = nextTurnStrength(unit);
        if (UNITS[unit.line].siege) siege = Math.max(siege, s);
        else strength = Math.max(strength, s);
        if (UNITS[unit.line].reach >= 2) cavalry = Math.max(cavalry, s);
      }
      for (const n of grid.neighbors(t)) {
        if (enemyComponent[n] !== -1 || state.owners[n] !== owner) continue;
        if (!movementLinked(state, t, n, owner)) continue;
        enemyComponent[n] = id;
        tiles.push(n);
      }
    }
    componentTiles.push(tiles);
    componentStrength.push(strength);
    componentSiege.push(siege);
    componentCavalry.push(cavalry);
  }

  // Enemy regions that could buy a fighter next turn and send it one step out.
  const regionBuy = new Int8Array(regions.regions.length);
  for (const region of regions.regions) {
    if (!enemies.has(region.owner)) continue;
    const center = region.tiles.find((t) => state.centers[t] !== undefined);
    const treasury = center === undefined ? undefined : state.centers[center]?.treasury;
    if (!treasury) continue;
    let gold = treasury.gold;
    for (const t of region.tiles) gold += ECONOMY.tileGold[state.map.tiles[t]?.terrain ?? 'sea'];
    for (const line of UNIT_LINES) {
      const spec = UNITS[line];
      if (!spec.fights || spec.siege || gold < spec.cost) continue;
      if (!lineUnlocked(state, region.owner, line)) continue;
      if (!hasActiveBuilding(state, region.tiles, spec.requires)) continue;
      regionBuy[region.id] = Math.max(regionBuy[region.id] ?? 0, spec.buyLevel);
    }
  }

  // Cavalry: two steps out, through a tile without a unit that is not its owner's.
  const cavalryThreat = new Int8Array(tileCount);
  componentTiles.forEach((tiles, id) => {
    const strength = componentCavalry[id] ?? 0;
    if (strength === 0) return;
    const owner = state.owners[tiles[0] ?? 0] ?? null;
    if (owner === null) return;
    for (const t of tiles) {
      for (const m of grid.neighbors(t)) {
        if (state.owners[m] === owner || state.units[m] || !movementLinked(state, t, m, owner)) {
          continue;
        }
        for (const target of grid.neighbors(m)) {
          if (state.owners[target] === owner || !movementLinked(state, m, target, owner)) continue;
          cavalryThreat[target] = Math.max(cavalryThreat[target] ?? 0, strength);
        }
      }
    }
  });

  const protection = new Int8Array(tileCount);
  for (let tile = 0; tile < tileCount; tile++) {
    if (state.owners[tile] !== null) protection[tile] = strongest(protectorsOf(state, tile));
  }

  // Economy of own regions; the capital region saves up for the next age.
  const forecast = turnStartForecast(state, player);
  const capital = capitalOf(state, player);
  const info = state.players[player];
  const target = advanceTarget(state, player);
  const price = target && ageCost(target);
  const capitalRegion = capital === undefined ? undefined : regions.regionOf[capital];
  const capitalTiles =
    capitalRegion === undefined ? [] : (regions.regions[capitalRegion]?.tiles ?? []);
  // Saving only makes sense once the capital region gains the food and materials it needs.
  const capitalForecast = forecast.find((f) => f.center !== undefined && f.center === capital);
  const saving =
    price !== undefined &&
    capitalForecast !== undefined &&
    capitalForecast.income.food > capitalForecast.unitUpkeep &&
    capitalForecast.income.materials > 0 &&
    !info?.advancing &&
    state.round >= AI.age.saveFromRound &&
    capitalTiles.length >= AI.age.minTiles &&
    (hasActiveBuilding(state, capitalTiles, 'barracks') ||
      hasActiveBuilding(state, capitalTiles, 'archeryRange'));
  const economy = new Map<number, RegionEconomy>();
  for (const f of forecast) {
    if (f.center === undefined) continue;
    const id = regions.regionOf[f.center] ?? NO_REGION;
    const region = regions.regions[id];
    const treasury = state.centers[f.center]?.treasury;
    if (!region || !treasury) continue;
    const isCapital = f.center === capital;
    const reserve = isCapital && saving ? price : emptyResources();
    economy.set(id, {
      region,
      center: f.center,
      capital: isCapital,
      treasury,
      forecast: f,
      spendable: {
        gold: Math.max(0, treasury.gold - reserve.gold),
        food: Math.max(0, treasury.food - reserve.food),
        materials: Math.max(0, treasury.materials - reserve.materials),
      },
      shortfall: {
        gold: Math.max(0, reserve.gold - treasury.gold),
        food: Math.max(0, reserve.food - treasury.food),
        materials: Math.max(0, reserve.materials - treasury.materials),
      },
      foodNet: f.income.food - f.unitUpkeep,
      goldNet: f.income.gold - f.buildingUpkeep,
      materialsIncome: f.income.materials,
    });
  }

  const view: AiView = {
    state,
    player,
    grid,
    personality: personality ?? personalityOf(state, player),
    regions,
    economy,
    saving,
    threat: new Int8Array(tileCount),
    protection,
    baseWorth: new Float64Array(tileCount),
    risk: new Float64Array(tileCount),
    totalRisk: 0,
    atRisk: [],
    enemyComponent,
    componentStrength,
    componentSiege,
    regionBuy,
    cavalryThreat,
  };

  const atRisk: number[] = [];
  let totalRisk = 0;
  for (let tile = 0; tile < tileCount; tile++) {
    // For enemy tiles: how strongly they could be taken back once taken.
    view.threat[tile] = threatAt(view, tile);
    if (state.owners[tile] !== player) continue;
    const base = tileWorth(state, regions, player, tile);
    view.baseWorth[tile] = base;
    if ((view.threat[tile] ?? 0) > (protection[tile] ?? 0)) {
      const risk = (base + unitWorth(state.units[tile])) * AI.risk * view.personality.caution;
      view.risk[tile] = risk;
      totalRisk += risk;
      atRisk.push(tile);
    }
  }
  return { ...view, totalRisk, atRisk };
}

/** Expected loss of an own tile with this worth, threat and protection. */
export function riskOf(view: AiView, worth: number, threat: number, protection: number): number {
  return threat > protection ? worth * AI.risk * view.personality.caution : 0;
}
