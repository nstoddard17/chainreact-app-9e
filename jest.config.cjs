/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/test/setup/workflowsV2.ts"],
  collectCoverageFrom: [
    "lib/workflows/variableReferences.ts",
    "lib/workflows/variableResolution.ts",
    "lib/workflows/actions/core/resolveValue.ts",
    "lib/workflows/ai-agent/providerSwapping.ts",
    "lib/workflows/ai-agent/templateMatching.ts",
    "lib/integrations/errorClassificationService.ts",
    "lib/integrations/tokenRefreshService.ts",
    "lib/utils/fetch-with-timeout.ts",
    "lib/security/encryption.ts",
  ],
}
