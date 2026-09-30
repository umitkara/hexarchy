import { UNITS, VOLLEY } from '../balance';
import type { CommandError } from '../commands/types';
import type { GameState, PlayerId, Unit } from '../state/game';
import { mapGrid } from '../state/map';
import { unitStrength } from './units';

/**
 * Archer volley (GDD 7.3): an archer of the player on turn (not exhausted) shoots at an
 * enemy unit up to VOLLEY.range tiles away, whatever edges lie between. The target fights
 * and protects at −VOLLEY.penalty strength until the turn ends; the archer is exhausted.
 * Volleys do not stack: a suppressed unit cannot be targeted again (decision 50).
 */

type RulesState = Pick<GameState, 'map' | 'owners' | 'units' | 'currentPlayer'>;

/** An archer on `from` picking a target. */
export interface VolleySource {
  readonly kind: 'volley';
  readonly from: number;
}

export interface Volley {
  readonly from: number;
  readonly target: number;
  readonly owner: PlayerId;
  /** The target unit afterwards. */
  readonly unit: Unit;
}

export type VolleyCheck =
  | { readonly ok: true; readonly volley: Volley }
  | { readonly ok: false; readonly error: CommandError };

export function checkVolleySource(
  state: RulesState,
  source: VolleySource,
): { readonly ok: true } | { readonly ok: false; readonly error: CommandError } {
  if (!mapGrid(state.map).has(source.from)) return { ok: false, error: 'unknownTile' };
  const archer = state.units[source.from];
  if (!archer) return { ok: false, error: 'noUnit' };
  if (state.owners[source.from] !== state.currentPlayer) return { ok: false, error: 'notYourUnit' };
  if (!UNITS[archer.line].volley) return { ok: false, error: 'cannotVolley' };
  if (archer.exhausted) return { ok: false, error: 'exhausted' };
  return { ok: true };
}

export function checkVolley(state: RulesState, source: VolleySource, target: number): VolleyCheck {
  const checked = checkVolleySource(state, source);
  if (!checked.ok) return checked;
  const grid = mapGrid(state.map);
  if (!grid.has(target)) return { ok: false, error: 'unknownTile' };
  if (target === source.from || grid.distance(source.from, target) > VOLLEY.range) {
    return { ok: false, error: 'outOfRange' };
  }
  const unit = state.units[target];
  const owner = state.owners[target] ?? null;
  if (!unit || owner === null) return { ok: false, error: 'noUnit' };
  if (owner === state.currentPlayer) return { ok: false, error: 'notEnemy' };
  if (unit.suppressed) return { ok: false, error: 'alreadySuppressed' };
  if (unitStrength(unit) === 0) return { ok: false, error: 'noEffect' };
  return {
    ok: true,
    volley: { from: source.from, target, owner, unit: { ...unit, suppressed: true } },
  };
}

export interface VolleyOption {
  readonly tile: number;
  readonly check: VolleyCheck;
}

/** Every enemy unit within range, ascending, with its check; empty if the archer cannot shoot. */
export function volleyOptions(state: RulesState, source: VolleySource): VolleyOption[] {
  if (!checkVolleySource(state, source).ok) return [];
  const grid = mapGrid(state.map);
  const options: VolleyOption[] = [];
  for (let tile = 0; tile < grid.tileCount; tile++) {
    if (tile === source.from || grid.distance(source.from, tile) > VOLLEY.range) continue;
    const owner = state.owners[tile] ?? null;
    if (!state.units[tile] || owner === null || owner === state.currentPlayer) continue;
    options.push({ tile, check: checkVolley(state, source, tile) });
  }
  return options;
}
