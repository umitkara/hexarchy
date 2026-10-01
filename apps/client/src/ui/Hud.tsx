import { useEffect } from 'react';
import { DEBUG } from '../debug';
import { gameStore, useGameStore } from '../store/gameStore';
import { ActionHint } from './ActionHint';
import { AiBanner } from './AiBanner';
import { AgePanel } from './AgePanel';
import { DebugPanel } from './DebugPanel';
import { Encyclopedia } from './Encyclopedia';
import { GameOver } from './GameOver';
import { Menu } from './Menu';
import { Notice } from './Notice';
import { RegionPanel } from './RegionPanel';
import { TileInfo } from './TileInfo';
import { TurnPanel } from './TurnPanel';

/**
 * Escape closes the encyclopedia or the menu, else drops the unit in hand; Ctrl/Cmd+Z
 * undoes the last move of the turn.
 */
function onKeyDown(event: KeyboardEvent) {
  const state = gameStore.getState();
  if (event.key === 'Escape' && (state.helpOpen || state.menuOpen)) {
    if (state.helpOpen) state.setHelpOpen(false);
    else state.setMenuOpen(false);
    return;
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    return;
  }
  if (state.helpOpen || state.menuOpen) return;
  if (event.key === 'Escape') {
    if (state.drag) state.endDrag(null);
    else if (state.armed) state.arm(null);
    else if (state.agePanelOpen) state.setAgePanelOpen(false);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (!state.drag) state.undo();
  }
}

/** The menu and encyclopedia buttons, with the title on wide screens. */
function TitlePanel() {
  const setMenuOpen = useGameStore((s) => s.setMenuOpen);
  const setHelpOpen = useGameStore((s) => s.setHelpOpen);
  return (
    <header className="hud-panel title-panel">
      <button
        type="button"
        className="icon-button title-button"
        aria-label="Menü"
        title="Menü"
        onClick={() => {
          setMenuOpen(true);
        }}
      >
        ☰
      </button>
      <h1 className="hud-title">Hexarchy</h1>
      <button
        type="button"
        className="icon-button title-button"
        aria-label="Ansiklopedi"
        title="Ansiklopedi"
        onClick={() => {
          setHelpOpen(true);
        }}
      >
        ?
      </button>
    </header>
  );
}

/** React HUD overlay on top of the Pixi canvas. */
export function Hud() {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="hud">
      <div className="hud-top">
        <TitlePanel />
        <TurnPanel />
        <TileInfo />
        <AgePanel />
        <AiBanner />
      </div>
      <Notice />
      <div className="hud-bottom">
        {DEBUG && <DebugPanel />}
        <div className="hud-side">
          <ActionHint />
          <RegionPanel />
        </div>
      </div>
      <GameOver />
      <Menu />
      <Encyclopedia />
    </div>
  );
}
