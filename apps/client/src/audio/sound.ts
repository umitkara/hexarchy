import type { GameEvent } from '@hexarchy/engine';
import { gameStore, type GameStoreState } from '../store/gameStore';
import { QUIET_ERRORS } from '../ui/labels';

/**
 * Simple synthesized sounds (PLAN M8, no audio files): short WebAudio tones for the game
 * events. One sound per command — the most important of its events — so a busy AI turn
 * does not turn into noise; AI moves play softer, skipped AI turns play nothing.
 */

type Cue =
  | 'victory'
  | 'defeat'
  | 'eliminated'
  | 'age'
  | 'capture'
  | 'kill'
  | 'buy'
  | 'build'
  | 'edge'
  | 'strike'
  | 'volley'
  | 'move'
  | 'yourTurn'
  | 'error';

/** One tone of a cue: start offset and length (s), pitch (Hz, glides to `to`), shape. */
interface Tone {
  readonly at: number;
  readonly length: number;
  readonly pitch: number;
  readonly to?: number;
  readonly type: OscillatorType;
  readonly gain: number;
}

/** A burst of filtered noise (impacts, whooshes). */
interface Noise {
  readonly at: number;
  readonly length: number;
  readonly filter: number;
  readonly to?: number;
  readonly gain: number;
}

interface Sound {
  readonly tones?: readonly Tone[];
  readonly noise?: readonly Noise[];
}

const note = (at: number, pitch: number, length = 0.14, gain = 0.22): Tone => ({
  at,
  length,
  pitch,
  type: 'triangle',
  gain,
});

const SOUNDS: Readonly<Record<Cue, Sound>> = {
  victory: { tones: [note(0, 523), note(0.12, 659), note(0.24, 784), note(0.36, 1047, 0.5)] },
  defeat: { tones: [note(0, 392, 0.2), note(0.18, 330, 0.2), note(0.36, 262, 0.6)] },
  eliminated: {
    tones: [{ at: 0, length: 0.5, pitch: 220, to: 110, type: 'sawtooth', gain: 0.08 }],
    noise: [{ at: 0, length: 0.4, filter: 600, gain: 0.25 }],
  },
  age: { tones: [note(0, 392), note(0.1, 523), note(0.2, 659, 0.35)] },
  capture: {
    tones: [{ at: 0, length: 0.12, pitch: 330, to: 440, type: 'square', gain: 0.06 }],
    noise: [{ at: 0, length: 0.08, filter: 1800, gain: 0.18 }],
  },
  kill: {
    tones: [{ at: 0, length: 0.18, pitch: 180, to: 90, type: 'square', gain: 0.07 }],
    noise: [{ at: 0, length: 0.15, filter: 1200, gain: 0.3 }],
  },
  buy: { tones: [note(0, 1319, 0.06, 0.12), note(0.06, 1760, 0.12, 0.12)] },
  build: {
    noise: [
      { at: 0, length: 0.06, filter: 500, gain: 0.5 },
      { at: 0.1, length: 0.06, filter: 500, gain: 0.4 },
    ],
  },
  edge: { noise: [{ at: 0, length: 0.07, filter: 700, gain: 0.45 }] },
  strike: { noise: [{ at: 0, length: 0.2, filter: 400, gain: 0.6 }] },
  volley: { noise: [{ at: 0, length: 0.22, filter: 3000, to: 900, gain: 0.25 }] },
  move: { tones: [{ at: 0, length: 0.05, pitch: 520, to: 620, type: 'sine', gain: 0.1 }] },
  yourTurn: { tones: [note(0, 659, 0.12, 0.14), note(0.1, 880, 0.2, 0.14)] },
  error: { tones: [{ at: 0, length: 0.12, pitch: 150, type: 'square', gain: 0.05 }] },
};

/** The cue of one event (null = none). */
function eventCue(event: GameEvent, human: number | undefined): Cue | null {
  switch (event.type) {
    case 'gameWon':
      return event.player === human ? 'victory' : 'defeat';
    case 'playerEliminated':
      return event.player === human ? 'defeat' : 'eliminated';
    case 'ageReached':
      return 'age';
    case 'unitKilled':
      return event.reason === 'eliminated' ? null : 'kill';
    case 'tileOwnerChanged':
      return event.to === null ? null : 'capture';
    case 'unitBought':
      return 'buy';
    case 'buildingBuilt':
      return 'build';
    case 'edgeBuilt':
      return 'edge';
    case 'edgeDamaged':
    case 'edgeDestroyed':
      return 'strike';
    case 'volley':
      return 'volley';
    case 'unitMoved':
    case 'unitsMerged':
      return 'move';
    case 'turnStarted':
      return event.player === human ? 'yourTurn' : null;
    default:
      return null;
  }
}

/** The cue of a command's events: the most important one wins (null = silence). */
function cueOf(events: readonly GameEvent[], human: number | undefined): Cue | null {
  let best: Cue | null = null;
  for (const event of events) {
    const cue = eventCue(event, human);
    if (cue && (best === null || ORDER.indexOf(cue) < ORDER.indexOf(best))) best = cue;
  }
  return best;
}

const ORDER: readonly Cue[] = [
  'victory',
  'defeat',
  'eliminated',
  'age',
  'kill',
  'capture',
  'strike',
  'volley',
  'buy',
  'build',
  'edge',
  'yourTurn',
  'move',
  'error',
];

/** AI moves play at this volume (the human's own at full). */
const AI_VOLUME = 0.45;
const MASTER_VOLUME = 0.8;

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }
  const length = Math.floor(context.sampleRate * 0.5);
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return context;
}

function envelope(ctx: AudioContext, start: number, length: number, gain: number): GainNode {
  const node = ctx.createGain();
  node.gain.setValueAtTime(0, start);
  node.gain.linearRampToValueAtTime(gain, start + 0.008);
  node.gain.exponentialRampToValueAtTime(0.0001, start + length);
  node.connect(ctx.destination);
  return node;
}

function play(cue: Cue, volume: number): void {
  const ctx = audio();
  if (ctx?.state !== 'running') return;
  const now = ctx.currentTime + 0.01;
  const sound = SOUNDS[cue];
  for (const tone of sound.tones ?? []) {
    const start = now + tone.at;
    const osc = ctx.createOscillator();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.pitch, start);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.length);
    osc.connect(envelope(ctx, start, tone.length, tone.gain * volume * MASTER_VOLUME));
    osc.start(start);
    osc.stop(start + tone.length + 0.02);
  }
  for (const burst of sound.noise ?? []) {
    if (!noiseBuffer) break;
    const start = now + burst.at;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(burst.filter, start);
    if (burst.to) filter.frequency.exponentialRampToValueAtTime(burst.to, start + burst.length);
    source.connect(filter);
    filter.connect(envelope(ctx, start, burst.length, burst.gain * volume * MASTER_VOLUME));
    source.start(start);
    source.stop(start + burst.length + 0.02);
  }
}

/** Browsers start audio only after a user gesture: unlock it on the first one. */
function unlock(): void {
  const ctx = audio();
  if (ctx?.state === 'suspended') void ctx.resume();
}

function humanOf(state: GameStoreState): number | undefined {
  if (state.hotseat) return undefined;
  return state.game.players.find((p) => p.controller === 'human')?.id;
}

/** Plays the sounds of the game events while not muted. Returns the stop function. */
export function startSound(): () => void {
  const unsubscribe = gameStore.subscribe((state, previous) => {
    if (state.settings.muted) return;
    if (state.feed && state.feed !== previous.feed) {
      const cue = cueOf(state.feed.events, humanOf(state));
      // Skipped AI turns stay silent, except for the human's turn coming back.
      if (!cue || (state.aiFast && cue !== 'yourTurn')) return;
      play(cue, state.feed.by === 'ai' && cue !== 'yourTurn' ? AI_VOLUME : 1);
    } else if (
      state.lastError &&
      state.lastError !== previous.lastError &&
      !QUIET_ERRORS.has(state.lastError.error)
    ) {
      play('error', 1);
    }
  });
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return () => {
    unsubscribe();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}
