import { CENTER_PROTECTION, COUNTER_BONUS } from '../balance';
import { edgeKey } from '../hex/edge';
import type { CenterKind, GameState, PlayerId, Unit } from '../state/game';
import { mapGrid, type EdgeFeature, type GameMap } from '../state/map';
import { unitStrength } from './units';

/**
 * Protection (GDD 7.1): who defends a tile, and with what strength.
 *
 * A tile is protected by its owner's unit on it, the owner's units on adjacent tiles and
 * the owner's region center on it or next to it. Melee units and centers protect across a
 * ford but not across a river. Archers and towers (M5) will protect across edges.
 * Derived data: computed from the state, never stored.
 */

export type Protector =
  | {
      readonly kind: 'unit';
      readonly tile: number;
      readonly owner: PlayerId;
      readonly strength: number;
      readonly unit: Unit;
    }
  | {
      readonly kind: 'center';
      readonly tile: number;
      readonly owner: PlayerId;
      readonly strength: number;
      readonly center: CenterKind;
    };

/** True if melee and center protection reach across this edge (GDD 7.1). */
export function edgeCarriesProtection(feature: EdgeFeature | undefined): boolean {
  return feature?.kind !== 'river';
}

export function protectionLinked(map: GameMap, a: number, b: number): boolean {
  return edgeCarriesProtection(map.edges[edgeKey(a, b)]);
}

/**
 * Everything that protects `tile`: the tile itself first, then its neighbors in direction
 * order; per tile the unit before the center. Neutral tiles have no protectors. Units of
 * strength 0 (workers) protect nothing: every attacker beats them anyway.
 */
export function protectorsOf(
  state: Pick<GameState, 'map' | 'owners' | 'centers' | 'units'>,
  tile: number,
): Protector[] {
  const owner = state.owners[tile] ?? null;
  if (owner === null) return [];
  const grid = mapGrid(state.map);
  const protectors: Protector[] = [];
  for (const t of [tile, ...grid.neighbors(tile)]) {
    if (state.owners[t] !== owner) continue;
    if (t !== tile && !protectionLinked(state.map, tile, t)) continue;
    const unit = state.units[t];
    if (unit && unitStrength(unit) > 0) {
      protectors.push({ kind: 'unit', tile: t, owner, strength: unitStrength(unit), unit });
    }
    const center = state.centers[t];
    if (center) {
      protectors.push({
        kind: 'center',
        tile: t,
        owner,
        strength: CENTER_PROTECTION[center.kind],
        center: center.kind,
      });
    }
  }
  return protectors;
}

/** The attacker's strength against one defender: level + counter bonus (GDD 7.1, 7.2). */
export function strengthAgainst(attacker: Unit, defender: Protector): number {
  const bonus =
    defender.kind === 'unit' ? (COUNTER_BONUS[attacker.line]?.[defender.unit.line] ?? 0) : 0;
  return unitStrength(attacker) + bonus;
}

/**
 * The protectors of `tile` that `attacker` does not beat. The attack succeeds iff there
 * are none: the attacker must be strictly stronger than every defender (GDD 7.1).
 */
export function attackBlockers(
  state: Pick<GameState, 'map' | 'owners' | 'centers' | 'units'>,
  attacker: Unit,
  tile: number,
): Protector[] {
  return protectorsOf(state, tile).filter((p) => strengthAgainst(attacker, p) <= p.strength);
}

/**
 * Protection map: the strongest protector of every tile (0 = unprotected), ignoring
 * counter bonuses. Indexed like `map.tiles`.
 */
export function computeProtectionMap(
  state: Pick<GameState, 'map' | 'owners' | 'centers' | 'units'>,
): Int8Array {
  const grid = mapGrid(state.map);
  const levels = new Int8Array(grid.tileCount);
  for (let tile = 0; tile < grid.tileCount; tile++) {
    for (const p of protectorsOf(state, tile))
      levels[tile] = Math.max(levels[tile] ?? 0, p.strength);
  }
  return levels;
}
