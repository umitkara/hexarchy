import type { Draft } from 'immer';
import { UNITS } from '../balance';
import { changeOwners } from '../rules/centers';
import type { GameEvent } from '../rules/events';
import { checkPlacement, type Placement, type UnitSource } from '../rules/placement';
import { removeUnit } from '../rules/upkeep';
import type { GameState } from '../state/game';
import type { BuyUnitCommand, MoveUnitCommand, Validation } from './types';

export function buySource(command: BuyUnitCommand): UnitSource {
  return { kind: 'recruit', center: command.center, line: command.line };
}

export function moveSource(command: MoveUnitCommand): UnitSource {
  return { kind: 'unit', from: command.from };
}

export function validateBuyUnit(state: GameState, command: BuyUnitCommand): Validation {
  const check = checkPlacement(state, buySource(command), command.tile);
  return check.ok ? { ok: true } : { ok: false, error: check.error };
}

export function validateMoveUnit(state: GameState, command: MoveUnitCommand): Validation {
  const check = checkPlacement(state, moveSource(command), command.to);
  return check.ok ? { ok: true } : { ok: false, error: check.error };
}

/** `state` is the validated state before the command; the draft is its working copy. */
export function applyBuyUnit(
  state: GameState,
  draft: Draft<GameState>,
  command: BuyUnitCommand,
  events: GameEvent[],
): void {
  const placement = placementOf(state, buySource(command), command.tile);
  const player = state.currentPlayer;
  const center = draft.centers[command.center];
  if (!center) throw new Error(`No center on tile ${command.center}`);
  const { cost } = UNITS[command.line];
  center.treasury.gold -= cost;
  events.push({
    type: 'unitBought',
    player,
    center: command.center,
    tile: command.tile,
    line: command.line,
    cost,
  });
  place(draft, placement, events);
}

export function applyMoveUnit(
  state: GameState,
  draft: Draft<GameState>,
  command: MoveUnitCommand,
  events: GameEvent[],
): void {
  const placement = placementOf(state, moveSource(command), command.to);
  removeUnit(draft, command.from);
  events.push({
    type: 'unitMoved',
    player: state.currentPlayer,
    from: command.from,
    to: command.to,
  });
  place(draft, placement, events);
}

function placementOf(state: GameState, source: UnitSource, tile: number): Placement {
  const check = checkPlacement(state, source, tile);
  if (!check.ok) throw new Error(`Invalid placement: ${check.error}`);
  return check.placement;
}

/** Puts the unit on its target; capturing and attacking change the owner first. */
function place(draft: Draft<GameState>, placement: Placement, events: GameEvent[]): void {
  const player = draft.currentPlayer;
  const { action, tile, unit } = placement;
  if (action === 'capture' || action === 'attack') {
    changeOwners(draft, [{ tile, owner: player }], events);
  }
  draft.units[tile] = { ...unit };
  if (action === 'merge') events.push({ type: 'unitsMerged', player, tile, unit: { ...unit } });
}
