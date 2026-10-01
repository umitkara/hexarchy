import { useEffect } from 'react';
import { GameCanvas } from './render/GameCanvas';
import { startSound } from './audio/sound';
import { startAiDriver } from './store/aiDriver';
import { startAutosave } from './store/autosave';
import { Hud } from './ui/Hud';

export function App() {
  useEffect(startAiDriver, []);
  useEffect(startAutosave, []);
  useEffect(startSound, []);

  return (
    <div className="app">
      <GameCanvas />
      <Hud />
    </div>
  );
}
