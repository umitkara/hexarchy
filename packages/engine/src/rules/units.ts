import { HUNGER, LEVEL_CAP, MAX_UNIT_LEVEL, UNITS, VOLLEY } from '../balance';
import type { CommandError } from '../commands/types';
import type { GameState, PlayerId, Unit, UnitLine } from '../state/game';

/** Unit basics (GDD 4.4, 6): strength, upkeep, merging. */

/** A freshly bought unit of a line. */
export function newUnit(line: UnitLine): Unit {
  return {
    line,
    level: UNITS[line].buyLevel,
    exhausted: false,
    hungry: false,
    suppressed: false,
  };
}

/**
 * Combat strength before counter bonuses (GDD 7.1: strength = level), less the hunger
 * penalty of a starving unit (GDD 4.5) and the volley penalty of a suppressed one (GDD 7.3).
 */
export function unitStrength(unit: Unit): number {
  const penalty =
    (unit.hungry ? HUNGER.strengthPenalty : 0) + (unit.suppressed ? VOLLEY.penalty : 0);
  return Math.max(0, unit.level - penalty);
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
 * most the line's top level and `cap` (the age lock). The merged unit is exhausted for
 * this turn, and hungry if either was.
 */
export function mergeUnits(a: Unit, b: Unit, cap: number): MergeResult {
  if (a.line !== b.line || !UNITS[a.line].merges) return { ok: false, error: 'cannotMerge' };
  const level = a.level + b.level;
  // A line topping out below the Slay maximum (archers: Sv3) says so; above it is `levelCap`.
  const { maxLevel } = UNITS[a.line];
  if (level > maxLevel && maxLevel < MAX_UNIT_LEVEL) return { ok: false, error: 'lineMaxLevel' };
  if (level > cap) return { ok: false, error: 'levelCap' };
  return {
    ok: true,
    unit: {
      line: a.line,
      level,
      exhausted: true,
      hungry: a.hungry || b.hungry,
      suppressed: false,
    },
  };
}
