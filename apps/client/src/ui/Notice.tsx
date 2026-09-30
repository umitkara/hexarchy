import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { announceEvent, COMMAND_ERROR_LABELS, QUIET_ERRORS } from './labels';

const NOTICE_MS = 2500;
const NEWS_MS = 4000;
/** Lines of news shown at once (the AI may bring several in a row). */
const NEWS_LINES = 4;

/**
 * Short-lived messages: why a command was refused, and the big news (an age advance, an
 * elimination, the victory). News queues up while the AI plays and fades a while after
 * the last line came in.
 */
export function Notice() {
  const lastError = useGameStore((s) => s.lastError);
  const news = useGameStore((s) => s.news);
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  const [newsHiddenUpTo, setNewsHiddenUpTo] = useState(0);
  const lines = useMemo(
    () =>
      news.flatMap((item) => {
        const text = announceEvent(item.event);
        return text === null ? [] : [{ id: item.id, text }];
      }),
    [news],
  );
  const lastLine = lines.at(-1)?.id ?? 0;

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
    if (lastLine === 0) return;
    const timer = window.setTimeout(() => {
      setNewsHiddenUpTo(lastLine);
    }, NEWS_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [lastLine]);

  const error =
    lastError && lastError.id !== hiddenId && !QUIET_ERRORS.has(lastError.error)
      ? COMMAND_ERROR_LABELS[lastError.error]
      : null;
  const shown = lines.filter((line) => line.id > newsHiddenUpTo).slice(-NEWS_LINES);
  if (!error && shown.length === 0) return null;
  return (
    <div className="notices">
      {shown.length > 0 && (
        <div className="news" role="status">
          {shown.map((line) => (
            <p key={line.id}>{line.text}</p>
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
