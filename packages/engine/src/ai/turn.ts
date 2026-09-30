import { AI, BUILDINGS, STRUCTURES, UNITS } from '../balance';
import { apply, validate } from '../commands/apply';
import type { Command } from '../commands/types';
import { edgeKey } from '../hex/edge';
import { checkAdvanceAge } from '../rules/ages';
import { buildingUnlocked, checkBuildTarget } from '../rules/buildings';
import type { GameEvent } from '../rules/events';
import { movementArea, movementLinked } from '../rules/movement';
import { targetOptions, type Placement } from '../rules/placement';
import { attackBlockers } from '../rules/protection';
import { NO_REGION } from '../rules/regions';
import {
  breachOptions,
  checkEdgeBuildTarget,
  structureUnlocked,
  type EdgeBuildInfo,
} from '../rules/structures';
import { levelCap, newUnit, unitUpkeep } from '../rules/units';
import { volleyOptions } from '../rules/volley';
import {
  ageAtLeast,
  BUILDING_KINDS,
  capitalOf,
  isGameOver,
  STRUCTURE_KINDS,
  UNIT_LINES,
  unitTiles,
  type BuildingKind,
  type GameState,
  type PlayerId,
  type StructureKind,
  type Unit,
  type UnitLine,
} from '../state/game';
import {
  buildScore,
  canFeed,
  economyAt,
  materialsCost,
  mergeFuture,
  mergeOutlook,
  mergeUpkeep,
  ownAreas,
  purchaseCost,
  riskDelta,
  takeGain,
  upkeepCost,
  type Change,
} from './score';
import { analyze, threatAt, type AiView, type RegionEconomy } from './view';

/**
 * The AI's turn (GDD 12, PLAN M7): a greedy utility AI. At every step it lists candidate
 * commands of the player on turn — built with the same rule functions as `validate` and
 * `legalCommands`, narrowed to the ones worth weighing — scores them (see score.ts), plays
 * the best one and looks again, until nothing scores `AI.minScore`; then it ends the turn.
 *
 * Pure and deterministic: the choice depends on the state alone (and on the few counters
 * of `AiTurn`); ties go to the earlier candidate. Every step makes progress — a unit acts
 * or is used up, resources are spent, or one of the limited repositioning moves is made —
 * and `AI.maxCommandsPerTurn` caps the turn, so it always ends.
 */

/** Why the AI plays a command (for tests, the debug log and tuning). */
export type AiIntent =
  | 'expand'
  | 'attack'
  | 'eliminate'
  | 'merge'
  | 'defend'
  | 'build'
  | 'structure'
  | 'walk'
  | 'volley'
  | 'breach'
  | 'advanceAge'
  | 'endTurn';

export interface AiChoice {
  readonly command: Command;
  readonly score: number;
  readonly intent: AiIntent;
}

/** Counters of the AI's current turn: the loop guards. */
export interface AiTurn {
  readonly player: PlayerId;
  readonly round: number;
  /** Commands played this turn. */
  readonly commands: number;
  /** Moves within own land this turn (they exhaust nothing, so they are limited). */
  readonly repositions: number;
  /** Tiles units were moved to within own land this turn: those units stay put. */
  readonly settled: readonly number[];
}

export function startAiTurn(state: Pick<GameState, 'currentPlayer' | 'round'>): AiTurn {
  return {
    player: state.currentPlayer,
    round: state.round,
    commands: 0,
    repositions: 0,
    settled: [],
  };
}

const END_TURN: AiChoice = { command: { type: 'endTurn' }, score: 0, intent: 'endTurn' };

/** Own tiles within `radius` steps of a tile at risk (where a defender helps). */
function nearRisk(view: AiView, radius: number): Set<number> {
  const tiles = new Set<number>();
  let ring = [...view.atRisk];
  for (const t of ring) tiles.add(t);
  for (let d = 0; d < radius; d++) {
    const next: number[] = [];
    for (const t of ring) {
      for (const n of view.grid.neighbors(t)) {
        if (tiles.has(n)) continue;
        tiles.add(n);
        next.push(n);
      }
    }
    ring = next;
  }
  return tiles;
}

function takeIntent(view: AiView, tile: number): AiIntent {
  const owner = view.state.owners[tile] ?? null;
  if (owner === null) return 'expand';
  return view.state.centers[tile]?.kind === 'capital' ? 'eliminate' : 'attack';
}

/** Score of taking a tile (capture or attack), from the unit's old tile if it moved. */
function takeScore(view: AiView, placement: Placement, from?: number): number {
  const change: Change = {
    ...(from !== undefined && { vacate: from }),
    place: { tile: placement.tile, unit: placement.unit },
    take: placement.tile,
  };
  return takeGain(view, placement.tile) - riskDelta(view, change);
}

/**
 * The ready fighters worth weighing: units of one area, line, level and hunger can do the
 * same things, so only the one whose leaving costs the least is asked (ties: lower tile).
 */
function representatives(view: AiView): Map<number, Unit> {
  const { state, player } = view;
  const areas = ownAreas(view);
  const best = new Map<string, { from: number; cost: number }>();
  for (const from of unitTiles(state)) {
    const unit = state.units[from];
    if (!unit || unit.exhausted || state.owners[from] !== player) continue;
    if (!UNITS[unit.line].fights) continue;
    const key = `${areas.component[from]}:${unit.line}:${unit.level}:${unit.hungry}`;
    const cost =
      (view.risk[from] ?? 0) > 0 || view.totalRisk > 0 ? riskDelta(view, { vacate: from }) : 0;
    const current = best.get(key);
    if (!current || cost < current.cost) best.set(key, { from, cost });
  }
  const result = new Map<number, Unit>();
  for (const { from } of best.values()) {
    const unit = state.units[from];
    if (unit) result.set(from, unit);
  }
  return result;
}

/** Candidates of the own units on the map: takes, merges, defending moves, strikes. */
function unitCandidates(view: AiView, turn: AiTurn, out: AiChoice[]): void {
  const { state, player } = view;
  const canReposition = turn.repositions < AI.maxRepositionsPerTurn && view.totalRisk > 0;
  const near = view.totalRisk > 0 ? [nearRisk(view, 1), nearRisk(view, 2)] : [];
  for (const [from, unit] of representatives(view)) {
    const line = UNITS[unit.line];
    const settled = turn.settled.includes(from);
    const guards = near[line.protectionRadius - 1];
    for (const { tile, check } of targetOptions(state, { kind: 'unit', from })) {
      if (!check.ok) continue;
      const { placement } = check;
      const command: Command = { type: 'moveUnit', from, to: tile };
      switch (placement.action) {
        case 'capture':
        case 'attack':
          out.push({
            command,
            score: takeScore(view, placement, from),
            intent: takeIntent(view, tile),
          });
          break;
        case 'merge': {
          const other = state.units[tile];
          const economy = economyAt(view, tile);
          if (!other || !economy) break;
          const future = mergeFuture(view, tile, placement.unit.level);
          if (future <= 0 && !guards?.has(tile)) break;
          const extra = mergeUpkeep(placement.unit, unit, other);
          if (!canFeed(view, economy, extra)) break;
          const score =
            future -
            riskDelta(view, { vacate: from, place: { tile, unit: placement.unit } }) -
            upkeepCost(economy, extra) -
            AI.actionLoss * (other.exhausted ? 1 : 2);
          out.push({ command, score, intent: 'merge' });
          break;
        }
        case 'move': {
          if (!canReposition || settled || !guards?.has(tile)) break;
          const score =
            -riskDelta(view, { vacate: from, place: { tile, unit: placement.unit } }) -
            AI.reposition;
          out.push({ command, score, intent: 'defend' });
          break;
        }
      }
    }
  }
  for (const from of unitTiles(state)) {
    const unit = state.units[from];
    if (!unit || unit.exhausted || state.owners[from] !== player) continue;
    if (UNITS[unit.line].volley) volleyCandidates(view, from, out);
    for (const { to, check } of breachOptions(state, { kind: 'breach', from })) {
      if (!check.ok) continue;
      out.push({
        command: { type: 'breachEdge', from, to },
        score: breachScore(view, to),
        intent: 'breach',
      });
    }
  }
}

function breachScore(view: AiView, to: number): number {
  const { state, grid, player } = view;
  const owner = state.owners[to] ?? null;
  let score = AI.breach * (owner !== null && owner !== player ? 1 : 0.5);
  const near = [to, ...grid.neighbors(to)].some((t) =>
    [t, ...grid.neighbors(t)].some((c) => {
      const center = state.centers[c];
      return center?.kind === 'capital' && state.owners[c] !== player;
    }),
  );
  if (near) score += AI.breachCapital;
  return score;
}

/**
 * Volleys worth firing: the suppressed unit was the last thing keeping an own ready unit
 * from taking a tile this turn (GDD 7.3).
 */
function volleyCandidates(view: AiView, from: number, out: AiChoice[]): void {
  const { state, grid, player } = view;
  const options = volleyOptions(state, { kind: 'volley', from });
  if (!options.some((o) => o.check.ok)) return;
  const attackers = readyAttackers(view, from);
  for (const { tile: target, check } of options) {
    if (!check.ok) continue;
    const suppressed = { ...state, units: { ...state.units, [target]: check.volley.unit } };
    const owner = check.volley.owner;
    let best = 0;
    const tiles = new Set([target, ...grid.neighbors(target)]);
    for (const n of grid.neighbors(target)) for (const m of grid.neighbors(n)) tiles.add(m);
    for (const t of tiles) {
      if (state.owners[t] !== owner) continue;
      for (const n of grid.neighbors(t)) {
        const attacker = state.owners[n] === player ? attackers.get(n) : undefined;
        if (!attacker || !movementLinked(state, n, t, player)) continue;
        if (attackBlockers(state, attacker, t).length === 0) continue;
        if (attackBlockers(suppressed, attacker, t).length > 0) continue;
        best = Math.max(best, takeGain(view, t) * AI.volleyFollow);
      }
    }
    if (best > 0) {
      out.push({ command: { type: 'archerVolley', from, target }, score: best, intent: 'volley' });
    }
  }
}

/** Per own tile: the strongest ready fighter whose area holds it (the archer `except` aside). */
function readyAttackers(view: AiView, except: number): Map<number, Unit> {
  const { state, player } = view;
  const result = new Map<number, Unit>();
  const seen = new Set<number>();
  for (const tile of unitTiles(state)) {
    if (seen.has(tile) || state.owners[tile] !== player) continue;
    const area = movementArea(state, tile);
    let best: Unit | undefined;
    for (const t of area) {
      seen.add(t);
      const unit = state.units[t];
      if (!unit || unit.exhausted || t === except || state.owners[t] !== player) continue;
      const line = UNITS[unit.line];
      if (!line.fights || line.siege) continue;
      if (!best || unit.level > best.level) best = unit;
    }
    if (best) for (const t of area) result.set(t, best);
  }
  return result;
}

/** Candidates of buying units: takes, merges and defenders, per region and line. */
function recruitCandidates(view: AiView, out: AiChoice[]): void {
  const { state } = view;
  const near = view.totalRisk > 0 ? [nearRisk(view, 1), nearRisk(view, 2)] : [];
  for (const economy of view.economy.values()) {
    if (economy.treasury.gold <= 0) continue;
    for (const line of UNIT_LINES) {
      const spec = UNITS[line];
      if (!spec.fights || economy.treasury.gold < spec.cost) continue;
      const bought = newUnit(line);
      const upkeep = unitUpkeep(bought);
      const guards = near[spec.protectionRadius - 1];
      const source = { kind: 'recruit', center: economy.center, line } as const;
      for (const { tile, check } of targetOptions(state, source)) {
        if (!check.ok) continue;
        const { placement } = check;
        const command: Command = { type: 'buyUnit', line, center: economy.center, tile };
        switch (placement.action) {
          case 'capture':
          case 'attack': {
            const cost = purchaseCost(view, economy, line, upkeep, false);
            if (cost === null) break;
            const score =
              takeScore(view, placement) - cost + AI.newUnit * view.personality.expansion;
            out.push({ command, score, intent: takeIntent(view, tile) });
            break;
          }
          case 'merge': {
            const other = state.units[tile];
            if (!other) break;
            const future = mergeFuture(view, tile, placement.unit.level);
            if (future <= 0 && !guards?.has(tile)) break;
            const cost = purchaseCost(
              view,
              economy,
              line,
              mergeUpkeep(placement.unit, other),
              false,
            );
            if (cost === null) break;
            const score =
              future -
              riskDelta(view, { place: { tile, unit: placement.unit } }) -
              cost -
              (other.exhausted ? 0 : AI.actionLoss);
            out.push({ command, score, intent: 'merge' });
            break;
          }
          case 'move': {
            if (!guards?.has(tile)) {
              musterCandidate(view, economy, line, tile, command, out);
              break;
            }
            const gain = -riskDelta(view, { place: { tile, unit: placement.unit } });
            const cost = purchaseCost(view, economy, line, upkeep, gain >= AI.emergency);
            if (cost === null) break;
            const score = gain - cost + (AI.newUnit * view.personality.expansion) / 2;
            out.push({ command, score, intent: 'defend' });
            break;
          }
        }
      }
    }
  }
}

/**
 * Mustering (GDD 6.2): where no own fighter is near an enemy tile that needs a merged unit,
 * a unit bought next to it now can be merged with a second one, to take it next turn.
 */
function musterCandidate(
  view: AiView,
  economy: RegionEconomy,
  line: UnitLine,
  tile: number,
  command: Command,
  out: AiChoice[],
): void {
  const areas = ownAreas(view);
  const id = areas.component[tile] ?? -1;
  if (id < 0 || (areas.levels[id]?.length ?? 0) > 0) return;
  const spec = UNITS[line];
  const merged = { ...newUnit(line), level: spec.buyLevel + 1 };
  const { value, target } = mergeOutlook(view, tile, merged.level);
  if (target === undefined || !view.grid.neighbors(tile).includes(target)) return;
  if (economy.spendable.gold < spec.cost * 2) return;
  const cost = purchaseCost(view, economy, line, unitUpkeep(merged), false);
  if (cost === null) return;
  const score =
    value * AI.muster - cost - riskDelta(view, { place: { tile, unit: newUnit(line) } });
  out.push({ command, score, intent: 'merge' });
}

/** The best tile of a building kind in a region, affordable or not. */
interface BuildPlan {
  readonly building: BuildingKind;
  readonly tile: number;
  readonly score: number;
  readonly cost: number;
}

/**
 * How a region spends its materials (GDD 4.3): the best plan of every building kind, the
 * goal it saves for (the most valuable plan it cannot yet afford, discounted by the turns
 * it takes to afford it) and the materials producer it keeps room for while it has none.
 */
interface MaterialsPlan {
  readonly plans: readonly BuildPlan[];
  readonly goal: number;
  readonly producer: BuildPlan | undefined;
}

const plansCache = new WeakMap<AiView, Map<number, MaterialsPlan>>();

function materialsPlan(view: AiView, economy: RegionEconomy): MaterialsPlan {
  let cache = plansCache.get(view);
  if (!cache) {
    cache = new Map();
    plansCache.set(view, cache);
  }
  const cached = cache.get(economy.center);
  if (cached) return cached;
  const { state, player } = view;
  const area = new Set(economy.region.tiles);
  const tiles = [...area].sort((a, b) => a - b);
  const options = (building: BuildingKind): BuildPlan[] => {
    const { cost } = BUILDINGS[building];
    const source = { kind: 'build', center: economy.center, building } as const;
    const result: BuildPlan[] = [];
    for (const tile of tiles) {
      const check = checkBuildTarget(state, source, { player, area, cost }, tile);
      if (!check.ok) continue;
      const score = buildScore(view, economy, check.placement);
      if (score !== null && score >= AI.minScore) result.push({ building, tile, score, cost });
    }
    return result;
  };
  const unlocked = BUILDING_KINDS.filter((b) => buildingUnlocked(state, player, b));
  const income = economy.materialsIncome;
  const has = (b: BuildingKind) => tiles.some((t) => state.buildings[t]?.kind === b);
  const unlockers = new Set<BuildingKind | null>(
    UNIT_LINES.map((line) => UNITS[line])
      .filter((u) => u.fights && ageAtLeast(state.players[player]?.age ?? 'dark', u.age))
      .map((u) => u.requires),
  );
  // Key buildings: a materials producer while the region yields none and a building to
  // buy soldiers while it has none. Their tiles are picked together and kept for them.
  const producers =
    income > 0
      ? []
      : unlocked.filter((b) => BUILDINGS[b].yield?.resource === 'materials').flatMap(options);
  const militaryNeeded = ![...unlockers].some((b) => b === null || has(b));
  const military = militaryNeeded ? unlocked.filter((b) => unlockers.has(b)).flatMap(options) : [];
  let producer: BuildPlan | undefined;
  let unlocker: BuildPlan | undefined;
  let bestPair = -Infinity;
  for (const p of [undefined, ...producers]) {
    for (const m of [undefined, ...military]) {
      if (p && p.tile === m?.tile) continue;
      const value = (p?.score ?? 0) + (m?.score ?? 0);
      if (value > bestPair) {
        bestPair = value;
        producer = p;
        unlocker = m;
      }
    }
  }
  const reserved = new Set([producer?.tile, unlocker?.tile]);
  const plans: BuildPlan[] = [];
  if (producer) plans.push(producer);
  if (unlocker) plans.push(unlocker);
  for (const building of unlocked) {
    if (building === producer?.building || building === unlocker?.building) continue;
    let best: BuildPlan | undefined;
    for (const option of options(building)) {
      if (reserved.has(option.tile) || (best && option.score <= best.score)) continue;
      best = option;
    }
    if (best) plans.push(best);
  }
  const { materials } = economy.spendable;
  let goal = 0;
  if (income > 0) {
    for (const plan of plans) {
      if (plan.cost <= materials) continue;
      const turns = Math.ceil((plan.cost - materials) / income);
      goal = Math.max(goal, plan.score * AI.savingDiscount ** turns);
    }
  }
  const plan = { plans, goal, producer };
  cache.set(economy.center, plan);
  return plan;
}

/**
 * Whether spending `cost` materials on something scoring `score` suits the region's plan:
 * it must beat the goal it saves for and leave room for a missing materials producer.
 */
/**
 * Materials a building may use: farms, lumber camps and quarries speed up the age savings,
 * so they may spend them; anything else only what is spendable.
 */
function availableFor(economy: RegionEconomy, building?: BuildingKind): number {
  const resource = building && BUILDINGS[building].yield?.resource;
  return resource === 'food' || resource === 'materials'
    ? economy.treasury.materials
    : economy.spendable.materials;
}

function fitsPlan(
  plan: MaterialsPlan,
  economy: RegionEconomy,
  cost: number,
  score: number,
  building?: BuildingKind,
): boolean {
  if (score < plan.goal) return false;
  const { producer } = plan;
  if (!producer || producer.building === building) return true;
  return availableFor(economy, building) - cost >= producer.cost;
}

/** The best tile of every building kind each region can afford and its plan allows. */
function buildCandidates(view: AiView, out: AiChoice[]): void {
  for (const economy of view.economy.values()) {
    const plan = materialsPlan(view, economy);
    for (const { building, tile, score, cost } of plan.plans) {
      if (availableFor(economy, building) < cost) continue;
      if (!fitsPlan(plan, economy, cost, score, building)) continue;
      out.push({
        command: { type: 'build', building, center: economy.center, tile },
        score,
        intent: 'build',
      });
    }
  }
}

/**
 * What a structure on the edge `from`–`to` is worth to the player (GDD 5.3): a bridge
 * joining two own regions or opening a crossing, a fence or wall that stops the enemy
 * from taking a tile at risk. Null if it is worth nothing.
 */
function structureValue(
  view: AiView,
  from: number,
  to: number,
  structure: StructureKind,
): number | null {
  const { state, player, regions } = view;
  const owner = state.owners[to] ?? null;
  switch (structure) {
    case 'bridge': {
      // A crossing toward land to take: worth a share of the best tile it opens up.
      if (owner !== player) return AI.bridgeOpen + takeGain(view, to) * AI.bridgeReach;
      const a = regions.regions[regions.regionOf[from] ?? NO_REGION];
      const b = regions.regions[regions.regionOf[to] ?? NO_REGION];
      if (!a || !b || a === b) return null;
      return AI.bridgeJoin + Math.min(a.tiles.length, b.tiles.length) * AI.tile.joinPerTile;
    }
    case 'fence':
    case 'wall': {
      if (owner === null || owner === player) return null;
      const existing = state.edgeStructures[edgeKey(from, to)];
      const breaksFences = levelCap(state, owner) >= STRUCTURES.fence.breakLevel;
      if (existing) {
        // Upgrading an own fence: only against enemies strong enough to break fences.
        return structure === 'wall' && breaksFences ? AI.wall : null;
      }
      const risk = view.risk[from] ?? 0;
      if (risk <= 0 || threatAt(view, from, to) > (view.protection[from] ?? 0)) return null;
      const value = risk - AI.fenceOffense;
      // Against fence breakers a wall holds better; otherwise the fence is enough.
      if (structure === 'wall') return breaksFences ? value : null;
      return breaksFences ? value / 2 : value;
    }
    case 'gate':
      return null;
  }
}

/**
 * Workers: build a structure where they stand, or walk (within own land) to where the
 * best one would go, to build it on the next step.
 */
function workerCandidates(view: AiView, turn: AiTurn, out: AiChoice[]): void {
  const { state, player } = view;
  for (const worker of unitTiles(state)) {
    const unit = state.units[worker];
    if (!unit || unit.exhausted || state.owners[worker] !== player) continue;
    if (!UNITS[unit.line].buildsEdges) continue;
    const economy = economyAt(view, worker);
    if (!economy) continue;
    const walk = turn.repositions < AI.maxRepositionsPerTurn && !turn.settled.includes(worker);
    const sites = walk ? movementArea(state, worker) : [worker];
    let best: AiChoice | undefined;
    for (const site of sites) {
      if (site !== worker && state.units[site]) continue;
      const found = bestStructureAt(view, economy, site);
      if (!found) continue;
      const score = site === worker ? found.score : found.score * AI.workerTravel;
      if (best && score <= best.score) continue;
      best =
        site === worker
          ? {
              command: { type: 'buildEdge', structure: found.structure, worker, to: found.to },
              score,
              intent: 'structure',
            }
          : { command: { type: 'moveUnit', from: worker, to: site }, score, intent: 'walk' };
    }
    if (best) out.push(best);
  }
}

/** The best structure a worker standing on `site` could build, and its score. */
function bestStructureAt(
  view: AiView,
  economy: RegionEconomy,
  site: number,
): { structure: StructureKind; to: number; score: number } | undefined {
  const { state, player, grid } = view;
  let best: { structure: StructureKind; to: number; score: number } | undefined;
  for (const to of grid.neighbors(site)) {
    for (const structure of STRUCTURE_KINDS) {
      if (!structureUnlocked(state, player, structure)) continue;
      const { cost } = STRUCTURES[structure];
      if (economy.spendable.materials < cost) continue;
      const info: EdgeBuildInfo = { player, center: economy.center, cost };
      const check = checkEdgeBuildTarget(state, { kind: 'edge', from: site, structure }, info, to);
      if (!check.ok) continue;
      const value = structureValue(view, site, to, structure);
      if (value === null) continue;
      const score = value - materialsCost(economy, cost);
      if (best && score <= best.score) continue;
      if (!fitsPlan(materialsPlan(view, economy), economy, cost, score)) continue;
      best = { structure, to, score };
    }
  }
  return best;
}

/**
 * Buying a worker (GDD 5.3) where a region has none and a structure is worth building: it
 * goes straight to the best site, to build there on the next step.
 */
function workerRecruitCandidates(view: AiView, out: AiChoice[]): void {
  const { state, player } = view;
  const line = UNIT_LINES.find((l) => UNITS[l].buildsEdges);
  if (!line) return;
  const spec = UNITS[line];
  for (const economy of view.economy.values()) {
    const { tiles } = economy.region;
    if (economy.spendable.gold < spec.cost) continue;
    if (tiles.some((t) => state.units[t]?.line === line)) continue;
    const cost = purchaseCost(view, economy, line, unitUpkeep(newUnit(line)), false);
    if (cost === null) continue;
    let best: AiChoice | undefined;
    const source = { kind: 'recruit', center: economy.center, line } as const;
    for (const { tile, check } of targetOptions(state, source)) {
      if (!check.ok || check.placement.action !== 'move' || state.owners[tile] !== player) continue;
      const found = bestStructureAt(view, economy, tile);
      if (!found) continue;
      const score = found.score * AI.workerTravel - cost - AI.workerNeed;
      if (best && score <= best.score) continue;
      best = {
        command: { type: 'buyUnit', line, center: economy.center, tile },
        score,
        intent: 'structure',
      };
    }
    if (best) out.push(best);
  }
}

function ageCandidate(view: AiView, out: AiChoice[]): void {
  const { state, player } = view;
  const check = checkAdvanceAge(state, player);
  if (!check.ok) return;
  const capital = capitalOf(state, player);
  const economy = capital === undefined ? undefined : economyAt(view, capital);
  if (capital === undefined || !economy) return;
  const { forecast } = economy;
  // Paying must not starve the capital region or idle its buildings at the next turn start.
  const food = forecast.before.food - check.cost.food + forecast.income.food - forecast.unitUpkeep;
  const gold =
    forecast.before.gold - check.cost.gold + forecast.income.gold - forecast.buildingUpkeep;
  if (food < 0 || gold < 0) return;
  const score = AI.age.advance - (view.risk[capital] ?? 0);
  out.push({ command: { type: 'advanceAge' }, score, intent: 'advanceAge' });
}

/** Every candidate the AI weighs at this step, scored (unsorted). */
export function aiCandidates(view: AiView, turn: AiTurn): AiChoice[] {
  const out: AiChoice[] = [];
  unitCandidates(view, turn, out);
  workerCandidates(view, turn, out);
  recruitCandidates(view, out);
  workerRecruitCandidates(view, out);
  buildCandidates(view, out);
  ageCandidate(view, out);
  return out;
}

/**
 * The AI's next command for the player on turn: the best candidate scoring at least
 * `AI.minScore`, else ending the turn. `turn` is reset when it belongs to another turn.
 */
export function chooseCommand(state: GameState, turn: AiTurn): AiChoice {
  if (turn.commands >= AI.maxCommandsPerTurn) return END_TURN;
  const view = analyze(state);
  const candidates = aiCandidates(view, turn)
    .filter((c) => c.score >= AI.minScore)
    .sort((a, b) => b.score - a.score);
  // Candidates come from the rule functions; validating guards against a scoring slip.
  return candidates.find((c) => validate(state, c.command).ok) ?? END_TURN;
}

export interface AiStep {
  readonly choice: AiChoice;
  /** The turn's counters after the choice. */
  readonly turn: AiTurn;
}

/** One step of the AI: its next command and the updated counters; null once the game is over. */
export function aiStep(state: GameState, turn?: AiTurn): AiStep | null {
  if (isGameOver(state)) return null;
  const current =
    turn?.player === state.currentPlayer && turn.round === state.round ? turn : startAiTurn(state);
  const choice = chooseCommand(state, current);
  const { command, intent } = choice;
  // Repositioned units stay put for the rest of the turn.
  const repositioned =
    command.type === 'moveUnit' && (intent === 'defend' || intent === 'walk')
      ? command.to
      : undefined;
  return {
    choice,
    turn: {
      ...current,
      commands: current.commands + 1,
      repositions: current.repositions + (repositioned === undefined ? 0 : 1),
      settled: repositioned === undefined ? current.settled : [...current.settled, repositioned],
    },
  };
}

export interface AiTurnResult {
  readonly state: GameState;
  readonly choices: readonly AiChoice[];
  readonly events: readonly GameEvent[];
}

/** Plays the whole turn of the player on turn (until it ends or the game is over). */
export function playAiTurn(state: GameState): AiTurnResult {
  const choices: AiChoice[] = [];
  const events: GameEvent[] = [];
  const player = state.currentPlayer;
  let turn: AiTurn | undefined;
  while (!isGameOver(state) && state.currentPlayer === player) {
    const step = aiStep(state, turn);
    if (!step) break;
    const result = apply(state, step.choice.command);
    choices.push(step.choice);
    events.push(...result.events);
    state = result.state;
    turn = step.turn;
    if (step.choice.command.type === 'endTurn') break;
  }
  return { state, choices, events };
}
