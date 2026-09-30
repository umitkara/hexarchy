import { LEVEL_CAP, MAX_UNIT_LEVEL, UNITS } from '../balance';
import type { CommandError } from '../commands/types';
import type { GameState, PlayerId, Unit, UnitLine } from '../state/game';

/** Unit basics (GDD 4.4, 6): strength, upkeep, merging. */

/** A freshly bought unit of a line. */
export function newUnit(line: UnitLine): Unit {
  return { line, level: UNITS[line].buyLevel, exhausted: false };
}

/** Combat strength before counter bonuses (GDD 7.1: strength = level). */
export function unitStrength(unit: Unit): number {
  return unit.level;
}

/** Turn-start upkeep of a unit (GDD 4.4). */
export function unitUpkeep(unit: Unit): number {
  return UNITS[unit.line].upkeep[unit.level] ?? 0;
}

/** Highest level a player can reach by merging (Slay maximum and the age lock, GDD 9.1). */
export function levelCap(state: Pick<GameState, 'players'>, player: PlayerId): number {
  const age = state.players[player]?.age ?? 'dark';
  return Math.min(MAX_UNIT_LEVEL, LEVEL_CAP[age]);
}

export type MergeResult =
  { readonly ok: true; readonly unit: Unit } | { readonly ok: false; readonly error: CommandError };

/**
 * Merges two units of one owner (GDD 6.2): same line only, levels add up (Slay sum) to at
 * most `cap`. The merged unit is exhausted for this turn.
 */
export function mergeUnits(a: Unit, b: Unit, cap: number): MergeResult {
  if (a.line !== b.line || !UNITS[a.line].merges) return { ok: false, error: 'cannotMerge' };
  const level = a.level + b.level;
  if (level > cap) return { ok: false, error: 'levelCap' };
  return { ok: true, unit: { line: a.line, level, exhausted: true } };
}
