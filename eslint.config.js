import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/']),

  // Plain JS config files (eslint.config.js, ...)
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // All TypeScript: strict, type-aware
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  // Architecture boundary: the engine is pure and deterministic.
  // It must never depend on the client, rendering, UI, Node or browser APIs.
  // (Browser/Node globals are also blocked by the engine tsconfig: lib ES only, no types.)
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'pixi.js', message: 'The engine must not depend on rendering.' },
            { name: 'react', message: 'The engine must not depend on UI.' },
            { name: 'react-dom', message: 'The engine must not depend on UI.' },
            { name: '@hexarchy/client', message: 'The engine must not depend on the client.' },
          ],
          patterns: [
            {
              group: ['@pixi/*', 'react/*', 'react-dom/*'],
              message: 'No rendering/UI in the engine.',
            },
            { group: ['**/apps/**'], message: 'The engine must not depend on the client.' },
            { group: ['node:*'], message: 'The engine must not depend on Node APIs.' },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in rng.ts.' },
        { object: 'Date', property: 'now', message: 'The engine must be deterministic.' },
      ],
    },
  },

  // React client
  {
    files: ['apps/client/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // Must stay last: turns off stylistic rules that conflict with Prettier.
  prettier,
]);
