import { Application } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { createScene } from './scene';

/** Full-screen Pixi canvas. Pixi is driven imperatively; React only owns the host element. */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let initialized = false;
    let disposed = false;
    let disposeScene: (() => void) | undefined;

    void app
      .init({
        resizeTo: host,
        background: '#1b2430',
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio,
      })
      .then(() => {
        initialized = true;
        // StrictMode mounts effects twice; the first instance may be disposed before init resolves.
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        host.appendChild(app.canvas);
        disposeScene = createScene(app);
      });

    return () => {
      disposed = true;
      disposeScene?.();
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  return <div ref={hostRef} className="game-canvas" />;
}
