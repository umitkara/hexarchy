import { current, type Draft } from 'immer';
import { edgeKey, edgeTiles } from '../hex/edge';
import {
  addResources,
  emptyResources,
  structureEdges,
  type Center,
  type GameState,
  type PlayerId,
  type Resources,
} from '../state/game';
import { mapGrid } from '../state/map';
import type { GameEvent } from './events';
import { computeRegions, innermostTile, regionAt } from './regions';
import { removeUnit } from './upkeep';

/**
 * Region centers and treasuries under ownership changes (GDD 4.2).
 *
 * - Split: the piece holding the center keeps it and its treasury. Every other piece of
 *   2+ tiles gets an automatic local center with an empty treasury, on its innermost tile.
 * - Single tiles have no treasury: a local center whose region shrinks to its own tile
 *   disappears with its treasury. The capital always stays.
 * - Merge: treasuries are summed into one center. The capital survives; otherwise the
 *   center of the region that was largest before the merge, then the one with more gold,
 *   then the lowest tile index.
 * - A captured center (its tile changes owner) is destroyed with its treasury; the rest of
 *   its region is then handled like any piece without a center.
 * - A unit on a tile that changes owner dies (an attacker then moves in).
 * - A building changes hands with its tile; it is lost if the tile becomes neutral.
 * - An edge structure passes to a player who comes to own both of its sides (GDD 5.3).
 * - Bridges change the treasury graph too: building or losing one also restores the center
 *   invariants (see reconcileCenters).
 */

export interface OwnerChange {
  readonly tile: number;
  readonly owner: PlayerId | null;
}

/**
 * Changes tile owners, then restores the center invariants. The only way ownership
 * changes, so splits, merges and unit losses always follow the same rules.
 */
export function changeOwners(
  draft: Draft<GameState>,
  changes: readonly OwnerChange[],
  events: GameEvent[],
): void {
  // Slicing a draft array of primitives yields a plain snapshot.
  const previousOwners = draft.owners.slice();
  for (const { tile, owner } of changes) {
    const from = draft.owners[tile] ?? null;
    if (from === owner) continue;
    const center = draft.centers[tile];
    if (center && from !== null) {
      events.push({
        type: 'centerRemoved',
        tile,
        owner: from,
        kind: center.kind,
        reason: 'captured',
        lost: { ...center.treasury },
      });
      removeCenter(draft, tile);
    }
    const unit = draft.units[tile];
    if (unit && from !== null) {
      events.push({ type: 'unitKilled', tile, owner: from, unit: { ...unit }, reason: 'captured' });
      removeUnit(draft, tile);
    }
    const building = draft.buildings[tile];
    if (building && from !== null) {
      if (owner === null) {
        events.push({ type: 'buildingDestroyed', tile, building: building.kind, owner: from });
        removeBuilding(draft, tile);
      } else {
        events.push({ type: 'buildingCaptured', tile, building: building.kind, from, to: owner });
      }
    }
    draft.owners[tile] = owner;
    events.push({ type: 'tileOwnerChanged', tile, from, to: owner });
  }
  takeOverStructures(
    draft,
    changes.map((c) => c.tile),
    events,
  );
  reconcileCenters(
    draft,
    { owners: previousOwners, edgeStructures: current(draft.edgeStructures) },
    events,
  );
}

/**
 * Edge structures next to `tiles` pass to the player who now owns both of their sides
 * (GDD 5.3, decision 30). Taking one side only leaves the structure to its owner.
 */
function takeOverStructures(
  draft: Draft<GameState>,
  tiles: readonly number[],
  events: GameEvent[],
): void {
  const grid = mapGrid(draft.map);
  const edges = new Set(tiles.flatMap((t) => grid.neighbors(t).map((n) => edgeKey(t, n))));
  for (const edge of structureEdges(draft)) {
    if (!edges.has(edge)) continue;
    const structure = draft.edgeStructures[edge];
    const [a, b] = edgeTiles(edge);
    const owner = draft.owners[a] ?? null;
    if (!structure || owner === null || draft.owners[b] !== owner || structure.owner === owner) {
      continue;
    }
    events.push({
      type: 'edgeCaptured',
      edge,
      structure: structure.kind,
      from: structure.owner,
      to: owner,
    });
    structure.owner = owner;
  }
}

/** The ownership and edges the center invariants last held for. */
export type RegionSnapshot = Pick<GameState, 'owners' | 'edgeStructures'>;

/**
 * Restores the center invariants after ownership or bridges changed from `previous` to the
 * draft's current state: merges, automatic local centers, isolated local centers.
 */
export function reconcileCenters(
  draft: Draft<GameState>,
  previous: RegionSnapshot,
  events: GameEvent[],
): void {
  const state: GameState = current(draft);
  const before = computeRegions(
    { map: state.map, edgeStructures: previous.edgeStructures },
    previous.owners,
  );
  const after = computeRegions(state, state.owners);
  const sizeBefore = (tile: number) => regionAt(before, tile)?.tiles.length ?? 0;
  const centerAt = (tile: number): Center => {
    const center = state.centers[tile];
    if (!center) throw new Error(`No center on tile ${tile}`);
    return center;
  };

  for (const region of after.regions) {
    const centers = region.tiles.filter((tile) => state.centers[tile] !== undefined);

    if (centers.length >= 2) {
      const [survivor, ...absorbed] = centers.sort((a, b) => {
        const ca = centerAt(a);
        const cb = centerAt(b);
        return (
          Number(cb.kind === 'capital') - Number(ca.kind === 'capital') ||
          sizeBefore(b) - sizeBefore(a) ||
          cb.treasury.gold - ca.treasury.gold ||
          a - b
        );
      }) as [number, ...number[]];
      let treasury: Resources = centerAt(survivor).treasury;
      for (const tile of absorbed) {
        treasury = addResources(treasury, centerAt(tile).treasury);
        removeCenter(draft, tile);
      }
      draft.centers[survivor] = { kind: centerAt(survivor).kind, treasury };
      events.push({
        type: 'treasuriesMerged',
        owner: region.owner,
        center: survivor,
        absorbed,
        treasury,
      });
    } else if (centers.length === 1) {
      const tile = centers[0] ?? 0;
      const center = centerAt(tile);
      if (region.tiles.length === 1 && center.kind === 'local') {
        removeCenter(draft, tile);
        events.push({
          type: 'centerRemoved',
          tile,
          owner: region.owner,
          kind: center.kind,
          reason: 'isolated',
          lost: center.treasury,
        });
      }
    } else if (region.tiles.length >= 2) {
      const tile = innermostTile(state, after, region);
      draft.centers[tile] = { kind: 'local', treasury: emptyResources() };
      events.push({ type: 'centerFounded', tile, owner: region.owner });
    }
  }
}

function removeBuilding(draft: Draft<GameState>, tile: number): void {
  // Buildings are keyed by tile index, so removing one means deleting its key.
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete draft.buildings[tile];
}

function removeCenter(draft: Draft<GameState>, tile: number): void {
  // Centers are keyed by tile index, so removing one means deleting its key.
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete draft.centers[tile];
}
