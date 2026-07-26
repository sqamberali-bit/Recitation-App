/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', 'test-results', '*.cjs', 'src/styles/fonts.css'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Empty catch blocks are used deliberately for best-effort browser APIs
    // (wake lock, fullscreen) that must never break the reading experience.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
  overrides: [
    {
      files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
      env: { node: true },
      extends: ['eslint:recommended'],
      rules: { '@typescript-eslint/no-unused-vars': 'off' },
    },
  ],
}
