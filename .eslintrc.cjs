module.exports = {
  root: true,
  extends: [
    require.resolve('@vercel/style-guide/eslint/node'),
    require.resolve('@vercel/style-guide/eslint/typescript'),
    require.resolve('@vercel/style-guide/eslint/prettier'),
  ],
  parserOptions: {
    project: require.resolve('./tsconfig.json'),
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: require.resolve('./tsconfig.json'),
      },
    },
  },
};
