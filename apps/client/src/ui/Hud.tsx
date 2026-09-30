import { DebugPanel } from './DebugPanel';
import { TileInfo } from './TileInfo';

/** React HUD overlay on top of the Pixi canvas. */
export function Hud() {
  return (
    <div className="hud">
      <div className="hud-top">
        <header className="hud-panel">
          <h1 className="hud-title">Hexarchy</h1>
        </header>
        <TileInfo />
      </div>
      <DebugPanel />
    </div>
  );
}
