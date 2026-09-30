import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { COMMAND_ERROR_LABELS } from './labels';

const NOTICE_MS = 2500;

/** Short-lived message when a command is refused. */
export function Notice() {
  const lastError = useGameStore((s) => s.lastError);
  const [hiddenId, setHiddenId] = useState<number | null>(null);

  useEffect(() => {
    if (!lastError) return;
    const timer = window.setTimeout(() => {
      setHiddenId(lastError.id);
    }, NOTICE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [lastError]);

  if (!lastError || lastError.id === hiddenId || lastError.error === 'noChange') return null;
  return (
    <div className="notice" role="status">
      {COMMAND_ERROR_LABELS[lastError.error]}
    </div>
  );
}
