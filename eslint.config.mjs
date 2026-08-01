import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['main.js', 'dist/**', 'coverage/**', 'esbuild.config.mjs', 'vitest.config.ts'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['strict-type-checked'].rules,
      ...tseslint.configs['stylistic-type-checked'].rules,

      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/dot-notation': 'off',

      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression > MemberExpression[property.name='toISOString']",
          message: 'toISOString() конвертирует в UTC и сдвигает локальную дату на день назад. Используйте toDateStr/toDateTimeLocalStr из src/domain/dateMath.',
        },
        {
          selector: "CallExpression > MemberExpression[property.name=/^set(UTC)?Month$/]",
          message: 'setMonth переполняет месяц: 31 января + 1 = 3 марта. Используйте addMonthsClamped из src/domain/dateMath.',
        },
        {
          selector: "AssignmentExpression > MemberExpression[property.name=/^(inner|outer)HTML$/]",
          message: 'innerHTML с интерполяцией — ожидающий своего часа XSS. Используйте createEl/createSpan или empty().',
        },
        {
          selector: "AssignmentExpression > MemberExpression[property.name='cssText']",
          message: 'Инлайн-стили не переопределяются темами Obsidian. Используйте класс в styles.css.',
        },
      ],
    },
  },
];
