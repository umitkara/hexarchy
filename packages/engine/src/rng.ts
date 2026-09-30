/**
 * Seeded, deterministic RNG.
 *
 * All randomness in the engine (map generation, forest spread, ...) must go through
 * this module, with its state stored in GameState. Same seed + same commands = same game.
 * `Math.random` is forbidden in the engine (enforced by ESLint).
 *
 * Placeholder: implemented in M1 (map generation).
 */
export {};
