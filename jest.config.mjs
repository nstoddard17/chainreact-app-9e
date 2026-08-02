/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  // BASELINE-TEST-GREEN-1 — bound parallelism to PHYSICAL cores, not logical
  // threads. Jest's default (logical CPUs − 1) oversubscribes hyperthreaded
  // machines: 15 jsdom workers on 8 physical cores starved heavy builder
  // integration suites past their 5s budgets, failing a churning ~5–25 suites
  // per full run (each passing in isolation). Measured on a 16-thread/8-core
  // box: default workers → 8 and 5 flaky suites across two runs; 50% (=8
  // workers) → 2679/2679 suites green. Coverage is unchanged — this caps
  // concurrency only; CI runners with ≤ this many cores are unaffected
  // (Jest already picks the smaller value there).
  maxWorkers: "50%",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Last-resort sweep of leaked @chainreact.test fixtures. Per-suite afterAll is
  // the primary mechanism; this only catches suites whose worker died before it
  // could run, and warns loudly when it has to do anything.
  globalTeardown: "<rootDir>/tests/globalTeardown.ts",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // MOBILE-COMPANION-M1 — resolve the mobile contracts by their published
    // name so server code imports the same specifier the Expo app will.
    "^@chainreact/mobile-contracts$":
      "<rootDir>/packages/mobile-contracts/src/index.ts",
    "\\.(css|less|scss|sass)$": "<rootDir>/tests/__mocks__/styleMock.js",
  },
  testMatch: [
    "<rootDir>/tests/unit/**/*.test.{ts,tsx}",
    "<rootDir>/tests/integration/**/*.test.{ts,tsx}",
    "<rootDir>/tests/parity/**/*.test.{ts,tsx}",
    "<rootDir>/tests/structure/**/*.test.{ts,tsx}",
  ],
  testPathIgnorePatterns: ["<rootDir>/tests/e2e/", "<rootDir>/node_modules/"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: { jsx: "react-jsx", esModuleInterop: true } },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};

export default config;
