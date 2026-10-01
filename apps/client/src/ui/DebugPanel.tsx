import { AGES, isLand, type Age, type GameMap, type PlayerId } from '@hexarchy/engine';
import { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { AGE_LABELS, describeEvent, playerName } from './labels';
import { PlayerSwatch } from './PlayerSwatch';

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

/**
 * Debug tools, shown with `?debug` in the address: hotseat (off: the AI plays the other
 * players), the current player's age (level cap), "paint tile" mode (splits/merges), map
 * statistics and the event log. New games are started from the menu.
 */
export function DebugPanel() {
  const map = useGameStore((s) => s.game.map);
  const players = useGameStore((s) => s.game.players);
  const painting = useGameStore((s) => s.painting);
  const paintOwner = useGameStore((s) => s.paintOwner);
  const setPainting = useGameStore((s) => s.setPainting);
  const setPaintOwner = useGameStore((s) => s.setPaintOwner);
  const lastEvents = useGameStore((s) => s.lastEvents);
  const hotseat = useGameStore((s) => s.hotseat);
  const setHotseat = useGameStore((s) => s.setHotseat);
  const current = useGameStore((s) => s.game.currentPlayer);
  const age = useGameStore((s) => s.game.players[s.game.currentPlayer]?.age);
  const dispatch = useGameStore((s) => s.dispatch);
  const [open, setOpen] = useState(() => window.innerWidth >= OPEN_BY_DEFAULT_MIN_WIDTH);
  const stats = useMemo(() => mapStats(map), [map]);
  const log = useMemo(
    () => lastEvents.map(describeEvent).filter((line) => line !== null),
    [lastEvents],
  );

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
        <button
          type="button"
          className={hotseat ? 'hud-button' : 'hud-button hud-button-secondary'}
          aria-pressed={hotseat}
          title="Açık: her oyuncuyu sırayla sen oynarsın. Kapalı: diğer oyuncuları AI oynar."
          onClick={() => {
            setHotseat(!hotseat);
          }}
        >
          Hotseat: {hotseat ? 'açık' : 'kapalı'}
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

          <label className="debug-row age-field">
            <span className="hud-label">{playerName(current)} çağı</span>
            <select
              className="hud-input"
              value={age}
              onChange={(event) => {
                dispatch({ type: 'debugSetAge', player: current, age: event.target.value as Age });
              }}
            >
              {AGES.map((a) => (
                <option key={a} value={a}>
                  {AGE_LABELS[a]}
                </option>
              ))}
            </select>
          </label>

          <p className="hud-meta debug-stats">
            Tohum {map.seed} · {stats.land} kara · {stats.lakes} göl · {stats.rivers} dere ·{' '}
            {stats.fords} geçit · {stats.veins} damar
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
