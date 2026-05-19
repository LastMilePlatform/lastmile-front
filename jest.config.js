module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/services/api/**/*.ts',
    'src/modules/auth/constants/**/*.ts',
    'src/modules/missions/constants/**/*.ts',
    'src/services/auth/**/*.ts',
    'src/services/state/**/*.ts',
    'src/constants/**/*.ts',
    'src/types/**/*.ts',
    'src/modules/campaigns/utils/**/*.ts',
    'src/services/realtime/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
