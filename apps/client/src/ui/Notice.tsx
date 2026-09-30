import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { announceEvent, COMMAND_ERROR_LABELS, QUIET_ERRORS } from './labels';

const NOTICE_MS = 2500;
const NEWS_MS = 4000;

/**
 * Short-lived messages: why a command was refused, and the big news of the last one (an
 * age advance, an elimination, the victory).
 */
export function Notice() {
  const lastError = useGameStore((s) => s.lastError);
  const lastEvents = useGameStore((s) => s.lastEvents);
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  const [hiddenEvents, setHiddenEvents] = useState<readonly unknown[] | null>(null);
  const news = useMemo(
    () => lastEvents.map(announceEvent).filter((line) => line !== null),
    [lastEvents],
  );

  useEffect(() => {
    if (!lastError) return;
    const timer = window.setTimeout(() => {
      setHiddenId(lastError.id);
    }, NOTICE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [lastError]);

  useEffect(() => {
    if (lastEvents.length === 0) return;
    const timer = window.setTimeout(() => {
      setHiddenEvents(lastEvents);
    }, NEWS_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [lastEvents]);

  const error =
    lastError && lastError.id !== hiddenId && !QUIET_ERRORS.has(lastError.error)
      ? COMMAND_ERROR_LABELS[lastError.error]
      : null;
  const showNews = news.length > 0 && hiddenEvents !== lastEvents;
  if (!error && !showNews) return null;
  return (
    <div className="notices">
      {showNews && (
        <div className="news" role="status">
          {news.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      {error && (
        <div className="notice" role="status">
          {error}
        </div>
      )}
    </div>
  );
}
