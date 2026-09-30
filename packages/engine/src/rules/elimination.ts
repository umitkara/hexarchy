import type { Draft } from 'immer';
import { winnerOf, type GameState, type PlayerId } from '../state/game';
import { changeOwners, type OwnerChange } from './centers';
import type { GameEvent } from './events';

/**
 * Capital conquest and victory (GDD 11; v0.1 has no castles to move the capital to):
 *
 * - Taking a player's capital eliminates them. The capital tile passes to the attacker
 *   (its treasury is lost, like any captured center's); every other tile of theirs turns
 *   neutral, so their units die, their buildings fall and their centers vanish with their
 *   treasuries. Their edge structures stay as ruins in their name: fences and walls still
 *   cut, their gates open for no one, and whoever takes both sides takes them over.
 * - An eliminated player's turns are skipped (see turn.ts).
 * - The last player standing wins; no command is accepted after that.
 */

/** The current player takes `tile` (capture or attack); a capital eliminates its owner. */
export function takeTile(draft: Draft<GameState>, tile: number, events: GameEvent[]): void {
  const player = draft.currentPlayer;
  const loser = draft.owners[tile] ?? null;
  const capital = loser !== null && draft.centers[tile]?.kind === 'capital';
  const changes: OwnerChange[] = [{ tile, owner: player }];
  if (capital) {
    draft.owners.forEach((owner, t) => {
      if (owner !== loser || t === tile) return;
      changes.push({ tile: t, owner: null, cause: 'eliminated' });
    });
  }
  changeOwners(draft, changes, events);
  if (capital) eliminate(draft, loser, player, tile, events);
}

function eliminate(
  draft: Draft<GameState>,
  player: PlayerId,
  by: PlayerId,
  capital: number,
  events: GameEvent[],
): void {
  const info = draft.players[player];
  if (!info) throw new Error(`Unknown player ${player}`);
  info.eliminated = { round: draft.round, by };
  info.advancing = null;
  events.push({ type: 'playerEliminated', player, by, capital, round: draft.round });
  const winner = winnerOf(draft);
  if (winner !== null) events.push({ type: 'gameWon', player: winner, round: draft.round });
}
