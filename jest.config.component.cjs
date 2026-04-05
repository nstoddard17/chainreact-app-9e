/** @type {import('jest').Config} */
const base = require('./jest.config.base.cjs')

module.exports = {
  ...base,
  testEnvironment: "jest-environment-jsdom",
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        diagnostics: false,
        tsconfig: { jsx: "react-jsx" },
      },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(uuid|@radix-ui)/)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "\\.(css|less|scss|sass)$": "<rootDir>/test/utils/style-mock.ts",
  },
  roots: [
    "<rootDir>/__tests__/components",
    "<rootDir>/__tests__/hooks",
  ],
  setupFilesAfterEnv: [
    "<rootDir>/test/setup/workflowsV2.ts",
    "<rootDir>/test/setup/component.ts",
  ],
}
