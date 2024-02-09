/** @type {import('eslint').Linter.Config}  */
module.exports = {
  root: true,
  extends: [
    require.resolve('@vercel/style-guide/eslint/node'),
    require.resolve('@vercel/style-guide/eslint/typescript'),
    'plugin:graphile-export/recommended',
    'plugin:markdown/recommended',
  ],
  parserOptions: {
    project: require.resolve('./tsconfig.json'),
  },
  plugins: ['only-warn', 'graphile-export'],
  rules: {
    '@typescript-eslint/method-signature-style': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-shadow': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    'eslint-comments/require-description': 'off',
    'no-console': 'warn',
    'no-param-reassign': 'off',
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: require.resolve('./tsconfig.json'),
      },
    },
  },
};
