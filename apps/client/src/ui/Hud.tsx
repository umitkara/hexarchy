import { DebugPanel } from './DebugPanel';
import { Notice } from './Notice';
import { RegionPanel } from './RegionPanel';
import { TileInfo } from './TileInfo';
import { TurnPanel } from './TurnPanel';

/** React HUD overlay on top of the Pixi canvas. */
export function Hud() {
  return (
    <div className="hud">
      <div className="hud-top">
        <header className="hud-panel">
          <h1 className="hud-title">Hexarchy</h1>
        </header>
        <TurnPanel />
        <TileInfo />
      </div>
      <Notice />
      <div className="hud-bottom">
        <DebugPanel />
        <RegionPanel />
      </div>
    </div>
  );
}
