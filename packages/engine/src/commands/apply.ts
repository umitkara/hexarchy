import { produce } from 'immer';
import type { GameEvent } from '../rules/events';
import { recordStats } from '../rules/stats';
import { endTurn } from '../rules/turn';
import { isGameOver, type GameState } from '../state/game';
import { applyAdvanceAge, validateAdvanceAge } from './ages';
import { applyBuild, validateBuild } from './build';
import { applyDebugPaint, validateDebugPaint } from './debugPaint';
import { applyDebugSetAge, validateDebugSetAge } from './debugSetAge';
import {
  applyArcherVolley,
  applyBreachEdge,
  applyBuildEdge,
  validateArcherVolley,
  validateBreachEdge,
  validateBuildEdge,
} from './edges';
import type { Command, CommandResult, Validation } from './types';
import { applyBuyUnit, applyMoveUnit, validateBuyUnit, validateMoveUnit } from './units';

const OK: Validation = { ok: true };

/** Checks a command against the rules without changing anything. */
export function validate(state: GameState, command: Command): Validation {
  // The game is over once a player has won (GDD 11); debug commands included.
  if (isGameOver(state)) return { ok: false, error: 'gameOver' };
  switch (command.type) {
    case 'endTurn':
      return OK;
    case 'buyUnit':
      return validateBuyUnit(state, command);
    case 'moveUnit':
      return validateMoveUnit(state, command);
    case 'build':
      return validateBuild(state, command);
    case 'buildEdge':
      return validateBuildEdge(state, command);
    case 'breachEdge':
      return validateBreachEdge(state, command);
    case 'archerVolley':
      return validateArcherVolley(state, command);
    case 'advanceAge':
      return validateAdvanceAge(state);
    case 'debugPaint':
      return validateDebugPaint(state, command);
    case 'debugSetAge':
      return validateDebugSetAge(state, command);
  }
}

/** Debug commands bypass the rules and are left out of the match statistics' counters. */
export function isDebugCommand(command: Command): boolean {
  return command.type === 'debugPaint' || command.type === 'debugSetAge';
}

export class InvalidCommandError extends Error {
  constructor(
    readonly command: Command,
    readonly validation: Validation & { ok: false },
  ) {
    super(`Invalid ${command.type} command: ${validation.error}`);
    this.name = 'InvalidCommandError';
  }
}

/**
 * Applies a valid command: a new state (structurally shared with the old one, which is
 * left untouched) and the events that happened. Throws InvalidCommandError otherwise.
 */
export function apply(state: GameState, command: Command): CommandResult {
  const validation = validate(state, command);
  if (!validation.ok) throw new InvalidCommandError(command, validation);
  const events: GameEvent[] = [];
  const next = produce(state, (draft) => {
    switch (command.type) {
      case 'endTurn':
        endTurn(draft, events);
        break;
      case 'buyUnit':
        applyBuyUnit(state, draft, command, events);
        break;
      case 'moveUnit':
        applyMoveUnit(state, draft, command, events);
        break;
      case 'build':
        applyBuild(draft, command, events);
        break;
      case 'buildEdge':
        applyBuildEdge(state, draft, command, events);
        break;
      case 'breachEdge':
        applyBreachEdge(state, draft, command, events);
        break;
      case 'archerVolley':
        applyArcherVolley(state, draft, command, events);
        break;
      case 'advanceAge':
        applyAdvanceAge(state, draft, events);
        break;
      case 'debugPaint':
        applyDebugPaint(draft, command, events);
        break;
      case 'debugSetAge':
        applyDebugSetAge(draft, command, events);
        break;
    }
    // Debug commands count toward nothing but the peak territory.
    recordStats(draft, isDebugCommand(command) ? [] : events);
  });
  return { state: next, events };
}
