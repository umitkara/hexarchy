import { hashString, isLand, normalizeSeed, type GameMap, type PlayerId } from '@hexarchy/engine';
import { useMemo, useState } from 'react';
import { randomSeed, useGameStore } from '../store/gameStore';
import { describeEvent, playerName } from './labels';
import { PlayerSwatch } from './PlayerSwatch';

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

/** Wide screens start with the panel open; phones start with it folded. */
const OPEN_BY_DEFAULT_MIN_WIDTH = 700;

/** Debug tools: new game by seed, "paint tile" mode (splits/merges), event log. */
export function DebugPanel() {
  const map = useGameStore((s) => s.game.map);
  const players = useGameStore((s) => s.game.players);
  const newGame = useGameStore((s) => s.newGame);
  const painting = useGameStore((s) => s.painting);
  const paintOwner = useGameStore((s) => s.paintOwner);
  const setPainting = useGameStore((s) => s.setPainting);
  const setPaintOwner = useGameStore((s) => s.setPaintOwner);
  const lastEvents = useGameStore((s) => s.lastEvents);
  const [open, setOpen] = useState(() => window.innerWidth >= OPEN_BY_DEFAULT_MIN_WIDTH);
  const [seedText, setSeedText] = useState(() => String(map.seed));
  const stats = useMemo(() => mapStats(map), [map]);
  const log = useMemo(
    () => lastEvents.map(describeEvent).filter((line) => line !== null),
    [lastEvents],
  );

  const restart = (seed: number) => {
    setSeedText(String(seed));
    newGame(seed);
  };

  const brushes: (PlayerId | null)[] = [...players.map((p) => p.id), null];

  return (
    <section className="hud-panel debug-panel" aria-label="Debug">
      <div className="debug-row">
        <button
          type="button"
          className="hud-button hud-button-secondary debug-toggle"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          Debug {open ? '▾' : '▸'}
        </button>
        <button
          type="button"
          className={painting ? 'hud-button paint-toggle' : 'hud-button hud-button-secondary'}
          aria-pressed={painting}
          onClick={() => {
            setPainting(!painting);
          }}
        >
          Boya: {painting ? 'açık' : 'kapalı'}
        </button>
      </div>

      {open && (
        <>
          <div className="debug-row" role="group" aria-label="Boya sahibi">
            {brushes.map((owner) => (
              <button
                key={owner ?? 'neutral'}
                type="button"
                className="brush"
                aria-pressed={painting && paintOwner === owner}
                title={owner === null ? 'Tarafsız' : playerName(owner)}
                onClick={() => {
                  setPaintOwner(owner);
                }}
              >
                <PlayerSwatch player={owner} />
                <span className="brush-label">
                  {owner === null ? 'Tarafsız' : playerName(owner)}
                </span>
              </button>
            ))}
          </div>

          <form
            className="debug-row"
            onSubmit={(event) => {
              event.preventDefault();
              restart(parseSeed(seedText));
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
              Yeni oyun
            </button>
            <button
              type="button"
              className="hud-button hud-button-secondary"
              onClick={() => {
                restart(randomSeed());
              }}
            >
              Rastgele
            </button>
          </form>

          <p className="hud-meta debug-stats">
            {stats.land} kara · {stats.lakes} göl · {stats.rivers} dere · {stats.fords} geçit ·{' '}
            {stats.veins} damar
          </p>

          {log.length > 0 && (
            <ol className="event-log" aria-label="Son olaylar">
              {log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
