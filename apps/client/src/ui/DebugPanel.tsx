import { hashString, isLand, normalizeSeed, type GameMap } from '@hexarchy/engine';
import { useMemo, useState } from 'react';
import { randomSeed, useMapStore } from '../store/mapStore';

/** Digits are used as-is; any other text is hashed, so words work as seeds too. */
function parseSeed(text: string): number {
  const trimmed = text.trim();
  return normalizeSeed(/^\d+$/.test(trimmed) ? Number(trimmed) : hashString(trimmed));
}

function mapStats(map: GameMap) {
  const edges = Object.values(map.edges);
  return {
    land: map.tiles.filter((t) => isLand(t.terrain)).length,
    lakes: map.tiles.filter((t) => t.terrain === 'lake').length,
    veins: map.tiles.filter((t) => t.vein).length,
    rivers: edges.filter((e) => e?.kind === 'river').length,
    fords: edges.filter((e) => e?.kind === 'ford').length,
  };
}

/** M1 debug panel: seed input, random seed, regenerate, map statistics. */
export function DebugPanel() {
  const map = useMapStore((s) => s.map);
  const generate = useMapStore((s) => s.generate);
  const [seedText, setSeedText] = useState(() => String(map.seed));
  const stats = useMemo(() => mapStats(map), [map]);

  const regenerate = (seed: number) => {
    setSeedText(String(seed));
    generate(seed);
  };

  return (
    <section className="hud-panel debug-panel" aria-label="Harita ayarları">
      <form
        className="debug-row"
        onSubmit={(event) => {
          event.preventDefault();
          regenerate(parseSeed(seedText));
        }}
      >
        <label className="seed-field">
          <span className="hud-label">Tohum</span>
          <input
            className="hud-input"
            value={seedText}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setSeedText(event.target.value);
            }}
          />
        </label>
        <button type="submit" className="hud-button">
          Yeniden üret
        </button>
        <button
          type="button"
          className="hud-button hud-button-secondary"
          onClick={() => {
            regenerate(randomSeed());
          }}
        >
          Rastgele tohum
        </button>
      </form>
      <p className="hud-meta debug-stats">
        {stats.land} kara · {stats.lakes} göl · {stats.rivers} dere · {stats.fords} geçit ·{' '}
        {stats.veins} damar
      </p>
    </section>
  );
}
