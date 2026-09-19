import globals from 'globals';

/**
 * Linting-Konfiguration.
 *
 * Bewusst schlank gehalten: Ziel ist, echte Fehler früh zu finden (unbenutzte
 * Variablen, undefinierte Referenzen, versehentliche Globals), nicht Stil zu
 * erzwingen. Die Regeln sind als `error` gesetzt, damit `npm run lint` bei
 * Verstößen mit Exit-Code 1 endet und in CI nutzbar ist.
 */
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'artifacts/**',
      '.pa-state/**',
      'test-results/**',
      'playwright-report/**',
      // Generierter Waffenkatalog: wird von scripts/build-weapon-catalog.mjs erzeugt.
      'src/shared/config/weapons.js',
    ],
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // Client
        ...globals.browser,
        // Server-Teil derselben Dateien (Prozess, Buffer, setInterval …)
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      // Selbstzugewiesene Werte sind fast immer ein Tippfehler wie `t ^= t`.
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      /*
       * Doppelte Klassenmember sind toter Code.
       *
       * FUND (belegt, 2026-09-18): `MatchController#projectileLifetime` stand
       * wortgleich ZWEIMAL untereinander, `get bitmap()` ebenso. In JavaScript
       * gewinnt die letzte Fassung — die erste las niemand, und wer die Regel
       * dort geändert hätte, hätte nichts bewirkt. Aufgefallen ist das erst mit
       * dieser Regel; `npm run lint` war vorher grün.
       */
      'no-dupe-class-members': 'error',
      'no-fallthrough': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-var': 'error',
    },
  },
  {
    files: ['tests/**/*.js', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', '*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Die Skripte laufen in Node, führen aber Code im Browserkontext aus
      // (page.evaluate) — daher zusätzlich die Browser-Globals.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
