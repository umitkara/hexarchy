import { hashString, normalizeSeed } from '@hexarchy/engine';
import { useState } from 'react';
import { isDecided, MAX_AIS, randomSeed, urlSeed, useGameStore } from '../store/gameStore';
import { playerName } from './labels';
import { PlayerSwatch } from './PlayerSwatch';

/** Digits are used as-is; any other text is hashed, so words work as seeds too. */
function parseSeed(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return randomSeed();
  return normalizeSeed(/^\d+$/.test(trimmed) ? Number(trimmed) : hashString(trimmed));
}

const AI_CHOICES = Array.from({ length: MAX_AIS }, (_, i) => i + 1);

/**
 * Main menu (PLAN M8): continue the saved game, start a new one (seed, number of AI
 * opponents), the encyclopedia and sound. Shown at start-up over a preview map, and from
 * the menu button during a game (the AI waits meanwhile).
 */
export function Menu() {
  const open = useGameStore((s) => s.menuOpen);
  const started = useGameStore((s) => s.started);
  const decided = useGameStore(isDecided);
  const round = useGameStore((s) => s.game.round);
  const players = useGameStore((s) => s.game.players.length);
  const human = useGameStore((s) => s.game.players.find((p) => p.controller === 'human')?.id);
  const settings = useGameStore((s) => s.settings);
  const newGame = useGameStore((s) => s.newGame);
  const resume = useGameStore((s) => s.resume);
  const setMenuOpen = useGameStore((s) => s.setMenuOpen);
  const setHelpOpen = useGameStore((s) => s.setHelpOpen);
  const setMuted = useGameStore((s) => s.setMuted);
  if (!open) return null;

  const canContinue = started && !decided;
  return (
    <div className="modal-backdrop menu-backdrop">
      <section className="hud-panel menu" role="dialog" aria-modal="true" aria-label="Menü">
        <header className="menu-header">
          <h1 className="menu-title">Hexarchy</h1>
          {started && (
            <button
              type="button"
              className="icon-button"
              aria-label="Menüyü kapat"
              onClick={() => {
                setMenuOpen(false);
              }}
            >
              ×
            </button>
          )}
        </header>
        <p className="hud-meta menu-tagline">
          Sıralı tur tabanlı hex strateji: toprağını büyüt, kasanı yönet, rakip başkentleri al.
        </p>

        {canContinue && (
          <button type="button" className="hud-button menu-continue" onClick={resume}>
            <span>Devam et</span>
            <span className="menu-continue-meta">
              {human !== undefined && <PlayerSwatch player={human} />}
              Tur {round} · {players - 1} AI
            </span>
          </button>
        )}

        <NewGameForm
          ais={settings.ais}
          primary={!canContinue}
          replaces={canContinue}
          onStart={newGame}
        />

        <div className="menu-row">
          <button
            type="button"
            className="hud-button hud-button-secondary"
            onClick={() => {
              setHelpOpen(true);
            }}
          >
            Ansiklopedi
          </button>
          <button
            type="button"
            className="hud-button hud-button-secondary"
            aria-pressed={!settings.muted}
            onClick={() => {
              setMuted(!settings.muted);
            }}
          >
            Ses: {settings.muted ? 'kapalı' : 'açık'}
          </button>
        </div>
        <p className="hud-meta menu-foot">
          v0.1 · Oyun bu tarayıcıya kendiliğinden kaydedilir. Sen {playerName(0)} oyuncusun.
        </p>
      </section>
    </div>
  );
}

function NewGameForm({
  ais: initialAis,
  primary,
  replaces,
  onStart,
}: {
  readonly ais: number;
  readonly primary: boolean;
  readonly replaces: boolean;
  readonly onStart: (options: { seed: number; ais: number }) => void;
}) {
  const [seedText, setSeedText] = useState(() => String(urlSeed() ?? randomSeed()));
  const [ais, setAis] = useState(initialAis);

  return (
    <form
      className="menu-new"
      onSubmit={(event) => {
        event.preventDefault();
        onStart({ seed: parseSeed(seedText), ais });
      }}
    >
      <h2 className="hud-label">Yeni oyun</h2>
      <div className="menu-field">
        <span className="menu-field-label">Rakipler</span>
        <div className="segmented" role="radiogroup" aria-label="AI rakip sayısı">
          {AI_CHOICES.map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={ais === count}
              className="segment"
              onClick={() => {
                setAis(count);
              }}
            >
              {count} AI
            </button>
          ))}
        </div>
      </div>
      <label className="menu-field">
        <span className="menu-field-label">Harita tohumu</span>
        <span className="seed-input">
          <input
            className="hud-input"
            value={seedText}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-label="Harita tohumu"
            onChange={(event) => {
              setSeedText(event.target.value);
            }}
          />
          <button
            type="button"
            className="hud-button hud-button-secondary"
            title="Rastgele tohum"
            aria-label="Rastgele tohum"
            onClick={() => {
              setSeedText(String(randomSeed()));
            }}
          >
            🎲
          </button>
        </span>
      </label>
      <button type="submit" className={primary ? 'hud-button' : 'hud-button hud-button-secondary'}>
        Başlat
      </button>
      {replaces && <p className="hud-meta menu-note">Yeni oyun kayıtlı oyunun yerini alır.</p>}
    </form>
  );
}
