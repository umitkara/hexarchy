import { expect } from 'vitest';
import { apply, validate, type Command, type CommandError } from '../src/commands';
import type { GameEvent } from '../src/rules';
import type { GameState } from '../src/state';
import { expectInvariants } from './fixtures/invariants';

/** Applies commands in order (each must be valid), checking the invariants after each. */
export function run(state: GameState, ...commands: Command[]) {
  const events: GameEvent[] = [];
  for (const command of commands) {
    const validation = validate(state, command);
    expect(validation, JSON.stringify(command)).toEqual({ ok: true });
    const result = apply(state, command);
    expectInvariants(result.state);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/** The error a command is refused with (fails if it is valid). */
export function refusal(state: GameState, command: Command): CommandError | undefined {
  const validation = validate(state, command);
  expect(validation.ok, `${JSON.stringify(command)} should be refused`).toBe(false);
  return validation.ok ? undefined : validation.error;
}

export function eventsOf<T extends GameEvent['type']>(events: readonly GameEvent[], type: T) {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

export const move = (from: number, to: number): Command => ({ type: 'moveUnit', from, to });

export const endTurn: Command = { type: 'endTurn' };
