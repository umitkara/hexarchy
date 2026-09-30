import { produce } from 'immer';
import type { GameEvent } from '../rules/events';
import { endTurn } from '../rules/turn';
import type { GameState } from '../state/game';
import { applyDebugPaint, validateDebugPaint } from './debugPaint';
import type { Command, CommandResult, Validation } from './types';

export * from './types';

const OK: Validation = { ok: true };

/** Checks a command against the rules without changing anything. */
export function validate(state: GameState, command: Command): Validation {
  switch (command.type) {
    case 'endTurn':
      return OK;
    case 'debugPaint':
      return validateDebugPaint(state, command);
  }
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
      case 'debugPaint':
        applyDebugPaint(draft, command, events);
        break;
    }
  });
  return { state: next, events };
}
