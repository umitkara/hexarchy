import { getEngineInfo } from '@hexarchy/engine';
import { useState } from 'react';

const engine = getEngineInfo();

/** React HUD overlay on top of the Pixi canvas. */
export function Hud() {
  const [clicks, setClicks] = useState(0);

  return (
    <div className="hud">
      <header className="hud-panel">
        <h1 className="hud-title">Hexarchy</h1>
        <span className="hud-meta">
          {engine.name} v{engine.version}
        </span>
      </header>

      <div className="hud-panel">
        <button
          type="button"
          className="hud-button"
          onClick={() => {
            setClicks((n) => n + 1);
          }}
        >
          Test
        </button>
        <span className="hud-meta" aria-live="polite">
          Tıklama: {clicks}
        </span>
      </div>
    </div>
  );
}
