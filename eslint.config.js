// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**', '**/playwright-report/**', '**/test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // The engine is pure: no ambient randomness or clocks. Everything comes in through `ctx`.
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'crypto', 'Date', 'setTimeout', 'setInterval', 'fetch'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use ctx.rng' },
        { object: 'Date', property: 'now', message: 'Use ctx.now' },
      ],
    },
  },
  // Feature-based folder boundaries for the web app.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { boundaries, 'react-hooks': reactHooks },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/web/src/app/**' },
        { type: 'feature', pattern: 'apps/web/src/features/*', capture: ['name'] },
        { type: 'shared', pattern: 'apps/web/src/shared/**' },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'app' } },
              allow: [{ to: { element: { type: 'feature' } } }, { to: { element: { type: 'shared' } } }],
            },
            {
              from: { element: { type: 'feature' } },
              allow: [
                { to: { element: { type: 'shared' } } },
                { to: { element: { type: 'feature', captured: { name: '{{from.captured.name}}' } } } },
              ],
            },
            {
              from: { element: { type: 'shared' } },
              allow: [{ to: { element: { type: 'shared' } } }],
            },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gambit/engine', '@gambit/engine/*'],
              message: 'The web app may only import @gambit/protocol. Engine types (the key card) must never reach the bundle.',
            },
          ],
        },
      ],
    },
  },
);
