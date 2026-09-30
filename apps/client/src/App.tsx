import { useEffect } from 'react';
import { GameCanvas } from './render/GameCanvas';
import { startAiDriver } from './store/aiDriver';
import { Hud } from './ui/Hud';

export function App() {
  useEffect(startAiDriver, []);

  return (
    <div className="app">
      <GameCanvas />
      <Hud />
    </div>
  );
}
