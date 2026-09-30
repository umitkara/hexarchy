import { GameCanvas } from './render/GameCanvas';
import { Hud } from './ui/Hud';

export function App() {
  return (
    <div className="app">
      <GameCanvas />
      <Hud />
    </div>
  );
}
