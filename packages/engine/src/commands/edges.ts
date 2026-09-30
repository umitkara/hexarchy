import type { Draft } from 'immer';
import { reconcileCenters } from '../rules/centers';
import type { GameEvent } from '../rules/events';
import {
  checkBreach,
  checkEdgeBuild,
  type BreachSource,
  type EdgeBuildSource,
} from '../rules/structures';
import { checkVolley, type VolleySource } from '../rules/volley';
import type { GameState } from '../state/game';
import type { ArcherVolleyCommand, BreachEdgeCommand, BuildEdgeCommand, Validation } from './types';

export function edgeBuildSource(command: BuildEdgeCommand): EdgeBuildSource {
  return { kind: 'edge', from: command.worker, structure: command.structure };
}

export function breachSource(command: BreachEdgeCommand): BreachSource {
  return { kind: 'breach', from: command.from };
}

export function volleySource(command: ArcherVolleyCommand): VolleySource {
  return { kind: 'volley', from: command.from };
}

export function validateBuildEdge(state: GameState, command: BuildEdgeCommand): Validation {
  const check = checkEdgeBuild(state, edgeBuildSource(command), command.to);
  return check.ok ? { ok: true } : { ok: false, error: check.error };
}

export function validateBreachEdge(state: GameState, command: BreachEdgeCommand): Validation {
  const check = checkBreach(state, breachSource(command), command.to);
  return check.ok ? { ok: true } : { ok: false, error: check.error };
}

export function validateArcherVolley(state: GameState, command: ArcherVolleyCommand): Validation {
  const check = checkVolley(state, volleySource(command), command.target);
  return check.ok ? { ok: true } : { ok: false, error: check.error };
}

/**
 * Pays the materials and puts the structure up at once; the worker is done for the turn
 * (GDD 5). A bridge joins the treasury graph, so regions on both banks may merge.
 */
export function applyBuildEdge(
  state: GameState,
  draft: Draft<GameState>,
  command: BuildEdgeCommand,
  events: GameEvent[],
): void {
  const check = checkEdgeBuild(state, edgeBuildSource(command), command.to);
  if (!check.ok) throw new Error(`Invalid edge build: ${check.error}`);
  const { build } = check;
  const player = state.currentPlayer;
  const center = draft.centers[build.center];
  const worker = draft.units[command.worker];
  if (!center || !worker) throw new Error('Edge build without treasury or worker');
  center.treasury.materials -= build.cost;
  worker.exhausted = true;
  const previous = state.edgeStructures[build.edge];
  draft.edgeStructures[build.edge] = {
    kind: build.structure,
    owner: player,
    damage: previous?.damage ?? 0,
  };
  events.push({
    type: 'edgeBuilt',
    player,
    center: build.center,
    worker: command.worker,
    edge: build.edge,
    structure: build.structure,
    replaces: build.replaces,
    cost: build.cost,
  });
  if (build.structure === 'bridge') {
    reconcileCenters(draft, { owners: state.owners, edgeStructures: state.edgeStructures }, events);
  }
}

/**
 * Strikes a structure: one siege hit, or a Sv3+ blow that breaks a fence. A fallen bridge
 * reopens its river, so regions on both banks may split.
 */
export function applyBreachEdge(
  state: GameState,
  draft: Draft<GameState>,
  command: BreachEdgeCommand,
  events: GameEvent[],
): void {
  const check = checkBreach(state, breachSource(command), command.to);
  if (!check.ok) throw new Error(`Invalid breach: ${check.error}`);
  const { breach } = check;
  const player = state.currentPlayer;
  const unit = draft.units[command.from];
  if (unit) unit.exhausted = true;
  const base = {
    player,
    unitTile: command.from,
    edge: breach.edge,
    structure: breach.structure,
    owner: breach.owner,
  };
  if (!breach.destroyed) {
    const structure = draft.edgeStructures[breach.edge];
    if (structure) structure.damage = breach.damage;
    events.push({ type: 'edgeDamaged', ...base, damage: breach.damage, hits: breach.hits });
    return;
  }
  // Structures are keyed by edge, so removing one means deleting its key.
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete draft.edgeStructures[breach.edge];
  events.push({ type: 'edgeDestroyed', ...base });
  if (breach.structure === 'bridge') {
    reconcileCenters(draft, { owners: state.owners, edgeStructures: state.edgeStructures }, events);
  }
}

/** The target is suppressed until the turn ends; the archer is done for the turn. */
export function applyArcherVolley(
  state: GameState,
  draft: Draft<GameState>,
  command: ArcherVolleyCommand,
  events: GameEvent[],
): void {
  const check = checkVolley(state, volleySource(command), command.target);
  if (!check.ok) throw new Error(`Invalid volley: ${check.error}`);
  const archer = draft.units[command.from];
  const target = draft.units[command.target];
  if (!archer || !target) throw new Error('Volley without archer or target');
  archer.exhausted = true;
  target.suppressed = true;
  events.push({
    type: 'volley',
    player: state.currentPlayer,
    from: command.from,
    target: command.target,
    owner: check.volley.owner,
    unit: check.volley.unit,
  });
}
