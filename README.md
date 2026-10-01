# Hexarchy

A turn-based hex strategy game for the browser. Hexarchy builds on Konkr.io and Slay, with
ideas from Age of Empires and Stronghold. You play one player against 1-3 AI opponents. A
match lasts 15-30 minutes, on desktop or mobile.

**Play:** https://umitkara.github.io/hexarchy/

## The game

- **Regions and treasuries:** connected tiles form a region, and every region has its own
  treasury of gold, food and materials. Units and buildings are paid for from it. Cut an
  enemy region in two and you cut its economy too.
- **Buildings:** farms, lumber camps and mines produce more for each fitting tile around them.
- **Units:** units merge into higher levels. A tile falls only to a strength greater than
  everything protecting it. Soldiers eat food: if a region runs out, they go hungry, and if
  it runs out again they revolt and die.
- **Edges:** rivers split the land. Bridges, fences, walls and gates are built on tile edges,
  and rams break them.
- **Ages:** reaching the Feudal Age unlocks cavalry, rams, towers, stone walls and level 3
  units.
- **Victory:** take every rival capital. A player whose capital falls is eliminated.

Every move can be undone until you end your turn. The game saves itself in your browser.
The in-game encyclopedia (the **?** button) explains the rules with the current numbers.

URL options: `?seed=N` pre-fills the map seed in the menu; `?debug` shows the debug panel
(hotseat, map painting).

## Development

Requirements: Node >= 22.12 and pnpm 11.

```sh
pnpm install
pnpm dev        # http://localhost:5173
```

| Command          | What it does                                        |
| ---------------- | --------------------------------------------------- |
| `pnpm dev`       | Client dev server (Vite)                            |
| `pnpm build`     | Production build of the client (`apps/client/dist`) |
| `pnpm test`      | Vitest tests, including 50 seeded AI matches        |
| `pnpm lint`      | ESLint (type-aware) and Prettier check              |
| `pnpm format`    | Formats all files with Prettier                     |
| `pnpm typecheck` | `tsc` in every package                              |

### Structure

```
packages/engine/   @hexarchy/engine: pure, deterministic game engine (TypeScript)
  src/rules/       rule functions (regions, economy, movement, combat, ages, ...)
  src/commands/    commands: validate / apply -> new state + events
  src/ai/          utility AI
  src/balance.ts   every balance number
apps/client/       @hexarchy/client: Vite + React (HUD) + PixiJS (map)
```

The engine has no dependencies on the browser, the client, Pixi or React. All randomness
comes from a seeded RNG, so the same seed and the same commands always play the same game.
The state is plain JSON and changes only through commands. The UI and the AI use the same
rule functions.

### Docs

- [`GDD.md`](GDD.md): game design (in Turkish). It is the source of truth for the rules and
  includes the decision log.
- [`PLAN.md`](PLAN.md): architecture and milestones (in Turkish).

### Deployment

Every push to `main` runs lint, typecheck, tests and the build in GitHub Actions
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). The result is published to
GitHub Pages.
