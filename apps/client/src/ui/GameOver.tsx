import {
  AGES,
  RESOURCE_KINDS,
  winnerOf,
  type GameState,
  type Player,
  type PlayerStats,
} from '@hexarchy/engine';
import { useState, type ReactNode } from 'react';
import { isDecided, useGameStore } from '../store/gameStore';
import { AGE_SHORT_LABELS, playerName, RESOURCE_LABELS } from './labels';
import { PlayerSwatch } from './PlayerSwatch';

/** Winner first, then players still in, then the eliminated, last out first. */
function standings(game: GameState): Player[] {
  const winner = winnerOf(game);
  const rank = (p: Player) =>
    p.id === winner ? Infinity : p.eliminated ? p.eliminated.round : game.round + 1;
  return [...game.players].sort((a, b) => rank(b) - rank(a) || a.id - b.id);
}

function statusText(game: GameState, player: Player): string {
  if (player.id === winnerOf(game)) return 'Kazandı';
  if (!player.eliminated) return 'Oyunda';
  const { round, by } = player.eliminated;
  return `Elendi · tur ${round} · ${playerName(by)}`;
}

function counts(game: GameState, player: number) {
  const own = (tile: string) => game.owners[Number(tile)] === player;
  return {
    tiles: game.owners.filter((o) => o === player).length,
    units: Object.keys(game.units).filter(own).length,
    buildings: Object.keys(game.buildings).filter(own).length,
  };
}

/** The age a player reached, with its round if it was advanced to: "Feodal (tur 9)". */
function ageText(player: Player, stats: PlayerStats | undefined): string {
  const round = stats?.ageRounds[player.age];
  const later = AGES.indexOf(player.age) > 0 && round !== undefined ? ` (tur ${round})` : '';
  return AGE_SHORT_LABELS[player.age] + later;
}

interface DetailRow {
  readonly label: string;
  readonly value: (stats: PlayerStats) => ReactNode;
}

/** Detail rows: one statistic per row, one column per player. */
const DETAILS: readonly DetailRow[] = [
  { label: 'Alınan karo', value: (s) => s.tilesCaptured },
  { label: 'Öldürülen birim', value: (s) => s.unitsKilled },
  { label: 'Kaybedilen birim', value: (s) => s.unitsLost },
  ...RESOURCE_KINDS.map((kind): DetailRow => ({
    label: `Gelir: ${RESOURCE_LABELS[kind].toLowerCase()}`,
    value: (s) => s.income[kind],
  })),
  { label: 'Alınan birim', value: (s) => s.unitsBought },
  { label: 'Kurulan bina', value: (s) => s.buildingsBuilt },
  { label: 'Kurulan yapı', value: (s) => s.structuresBuilt },
  {
    label: 'En geniş toprak',
    value: (s) => (
      <>
        {s.peakTiles} <span className="hud-meta">(tur {s.peakRound})</span>
      </>
    ),
  },
];

/**
 * End screen (GDD 11): the winner — or, against the AI, the human's elimination — and the
 * match summary. The details (combat, economy, peak territory) fold out.
 */
export function GameOver() {
  const game = useGameStore((s) => s.game);
  const hotseat = useGameStore((s) => s.hotseat);
  const decided = useGameStore(isDecided);
  const hidden = useGameStore((s) => s.resultsHidden);
  const setHidden = useGameStore((s) => s.setResultsHidden);
  const setMenuOpen = useGameStore((s) => s.setMenuOpen);
  const [details, setDetails] = useState(false);
  if (!decided || hidden) return null;

  const winner = winnerOf(game);
  const human = hotseat ? undefined : game.players.find((p) => p.controller === 'human');
  const humanOut = human?.eliminated ?? null;
  const title =
    winner !== null && winner === human?.id
      ? 'Zafer!'
      : humanOut
        ? 'Elendin'
        : winner !== null
          ? `${playerName(winner)} kazandı`
          : 'Oyun bitti';
  const subtitle = humanOut
    ? `Başkentini ${playerName(humanOut.by)} aldı, tur ${humanOut.round}.`
    : `Son kalan oyuncu · ${game.round} tur sürdü.`;
  const players = standings(game);

  return (
    <div className="game-over-backdrop">
      <section className="hud-panel game-over" role="dialog" aria-modal="true" aria-label={title}>
        <header className="game-over-header">
          {winner !== null && <PlayerSwatch player={winner} />}
          <h2 className="game-over-title">{title}</h2>
        </header>
        <p className="hud-meta game-over-subtitle">{subtitle}</p>

        <table className="results">
          <thead>
            <tr>
              <th scope="col">Oyuncu</th>
              <th scope="col">Toprak</th>
              <th scope="col">Birim</th>
              <th scope="col">Bina</th>
              <th scope="col">Çağ</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const count = counts(game, player.id);
              return (
                <tr key={player.id} className={player.eliminated ? 'results-out' : undefined}>
                  <th scope="row">
                    <span className="results-player">
                      <PlayerSwatch player={player.id} />
                      {playerName(player.id)}
                    </span>
                    <span className="results-status">{statusText(game, player)}</span>
                  </th>
                  <td>{count.tiles}</td>
                  <td>{count.units}</td>
                  <td>{count.buildings}</td>
                  <td>{ageText(player, game.stats[player.id])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button
          type="button"
          className="hud-button hud-button-secondary"
          aria-expanded={details}
          onClick={() => {
            setDetails(!details);
          }}
        >
          Detaylar {details ? '▾' : '▸'}
        </button>
        {details && (
          <div className="results-scroll">
            <table className="results results-details">
              <thead>
                <tr>
                  <td />
                  {players.map((player) => (
                    <th key={player.id} scope="col" title={playerName(player.id)}>
                      <span className="results-player">
                        <PlayerSwatch player={player.id} />
                        <span className="results-name">{playerName(player.id)}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DETAILS.map(({ label, value }) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {players.map((player) => {
                      const stats = game.stats[player.id];
                      return <td key={player.id}>{stats ? value(stats) : '–'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="game-over-actions">
          <button
            type="button"
            className="hud-button hud-button-secondary"
            onClick={() => {
              setHidden(true);
            }}
          >
            Haritaya bak
          </button>
          <button
            type="button"
            className="hud-button"
            onClick={() => {
              setMenuOpen(true);
            }}
          >
            Yeni oyun
          </button>
        </div>
      </section>
    </div>
  );
}
