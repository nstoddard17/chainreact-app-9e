/** @type {import('jest').Config} */
const base = require('./jest.config.base.cjs')

module.exports = {
  ...base,
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  testPathIgnorePatterns: [
    "<rootDir>/__tests__/components/",
    "<rootDir>/__tests__/hooks/",
  ],
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
