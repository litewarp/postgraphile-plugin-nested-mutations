module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'airbnb-base',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    'no-console': 1, // Means warning
    'prettier/prettier': 2, // Means error

    'import/no-unresolved': 0,
    'import/no-extraneous-dependencies': 0,
    'import/extensions': 0,
    'import/prefer-default-export': 0,
    'prefer-object-spread': 0,
    'max-len': 0,
    'symbol-description': 0,
    'no-nested-ternary': 0,
    'no-alert': 0,
    'no-console': 0,
    'no-plusplus': 0,
    'no-restricted-globals': 0,
    'no-underscore-dangle': [
      'error',
      {
        allow: ['_fields'],
      },
    ],
    'no-return-assign': ['error', 'except-parens'],
    'class-methods-use-this': 0,
    'prefer-destructuring': [
      'error',
      {
        object: true,
        array: false,
      },
    ],
  },
  env: {
    jest: true,
  },
  globals: {
    expect: false,
    jasmine: false,
  },
};
