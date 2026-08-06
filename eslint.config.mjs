import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      '@next/next/no-assign-module-variable': 'off',
    },
  },
  globalIgnores([
    '.next/**', 'node_modules/**', 'coverage/**', 'playwright-report/**',
    'tsconfig.tsbuildinfo', 'public/**',
  ]),
]);
