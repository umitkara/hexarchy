import { edgeKey, mapGrid, type EdgeKind } from '@hexarchy/engine';
import { useGameStore } from '../store/gameStore';
import { EDGE_LABELS, playerName, TERRAIN_LABELS } from './labels';
import { PlayerSwatch } from './PlayerSwatch';

/** Details of the hovered (or tapped) tile. */
export function TileInfo() {
  const map = useGameStore((s) => s.game.map);
  const owners = useGameStore((s) => s.game.owners);
  const index = useGameStore((s) => s.hoveredTile);
  const tile = index === null ? undefined : map.tiles[index];

  if (index === null || !tile) {
    return (
      <section className="hud-panel tile-info">
        <span className="hud-meta">Bir karonun üzerine gel ya da dokun</span>
      </section>
    );
  }

  const grid = mapGrid(map);
  const { q, r } = grid.coord(index);
  const owner = owners[index] ?? null;
  const edgeCounts = new Map<EdgeKind, number>();
  for (const n of grid.neighbors(index)) {
    const kind = map.edges[edgeKey(index, n)]?.kind;
    if (kind) edgeCounts.set(kind, (edgeCounts.get(kind) ?? 0) + 1);
  }
  const edgeText = [...edgeCounts].map(([kind, count]) => `${count} ${EDGE_LABELS[kind]}`);

  return (
    <section className="hud-panel tile-info" aria-live="polite">
      <strong className="tile-terrain">{TERRAIN_LABELS[tile.terrain]}</strong>
      {tile.vein && <span className="tile-tag">maden damarı</span>}
      {owner !== null && (
        <span className="tile-owner">
          <PlayerSwatch player={owner} />
          {playerName(owner)}
        </span>
      )}
      <span className="hud-meta">
        q {q}, r {r} · #{index}
        {edgeText.length > 0 && ` · ${edgeText.join(', ')}`}
      </span>
    </section>
  );
}
