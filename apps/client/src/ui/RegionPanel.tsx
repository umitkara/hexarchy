import {
  getRegions,
  regionAt,
  regionCenter,
  regionGoldIncome,
  RESOURCE_KINDS,
} from '@hexarchy/engine';
import { useGameStore } from '../store/gameStore';
import { CENTER_LABELS, playerName, RESOURCE_LABELS } from './labels';
import { PlayerSwatch } from './PlayerSwatch';

/** Treasury panel of the selected region (GDD 13: region selection → treasury panel). */
export function RegionPanel() {
  const game = useGameStore((s) => s.game);
  const tile = useGameStore((s) => s.selectedTile);
  const selectTile = useGameStore((s) => s.selectTile);
  if (tile === null) return null;

  const owner = game.owners[tile] ?? null;
  const region = regionAt(getRegions(game), tile);
  const centerTile = region && regionCenter(game, region);
  const center = centerTile === undefined ? undefined : game.centers[centerTile];

  return (
    <section className="hud-panel region-panel" aria-label="Bölge" aria-live="polite">
      <header className="region-header">
        <PlayerSwatch player={owner} />
        <strong>{owner === null ? 'Tarafsız karo' : `${playerName(owner)} bölgesi`}</strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Kapat"
          onClick={() => {
            selectTile(null);
          }}
        >
          ×
        </button>
      </header>
      {region && (
        <p className="hud-meta region-meta">
          {region.tiles.length} karo ·{' '}
          {center ? `${CENTER_LABELS[center.kind]} #${centerTile}` : 'merkez yok'}
        </p>
      )}
      {region && center && (
        <dl className="treasury">
          {RESOURCE_KINDS.map((kind) => (
            <div key={kind} className="treasury-item">
              <dt className="hud-label">{RESOURCE_LABELS[kind]}</dt>
              <dd>
                {center.treasury[kind]}
                {kind === 'gold' && (
                  <span className="income">+{regionGoldIncome(game.map, region)}/tur</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {region && !center && (
        <p className="hud-meta region-note">Tek karo: kasası yok, geliri boşa gider.</p>
      )}
    </section>
  );
}
