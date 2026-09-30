import { useEffect } from 'react';
import { gameStore } from '../store/gameStore';
import { ActionHint } from './ActionHint';
import { AiBanner } from './AiBanner';
import { AgePanel } from './AgePanel';
import { DebugPanel } from './DebugPanel';
import { GameOver } from './GameOver';
import { Notice } from './Notice';
import { RegionPanel } from './RegionPanel';
import { TileInfo } from './TileInfo';
import { TurnPanel } from './TurnPanel';

/** Escape drops the unit in hand; Ctrl/Cmd+Z undoes the last move of the turn. */
function onKeyDown(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    return;
  }
  const state = gameStore.getState();
  if (event.key === 'Escape') {
    if (state.drag) state.endDrag(null);
    else if (state.armed) state.arm(null);
    else if (state.agePanelOpen) state.setAgePanelOpen(false);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (!state.drag) state.undo();
  }
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
        <header className="hud-panel title-panel">
          <h1 className="hud-title">Hexarchy</h1>
        </header>
        <TurnPanel />
        <TileInfo />
        <AgePanel />
        <AiBanner />
      </div>
      <Notice />
      <div className="hud-bottom">
        <DebugPanel />
        <div className="hud-side">
          <ActionHint />
          <RegionPanel />
        </div>
      </div>
      <GameOver />
    </div>
  );
}
