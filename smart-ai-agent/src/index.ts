// Main exports for the Smart AI Agent library

export { default as SmartAIAgent } from './smartAIAgent.js';
export type {
  SmartAgentConfig,
  AIProviderConfig,
  FieldSchema,
  ExtractionContext,
  ExtractionResult,
  ExtractionMetadata
} from './smartAIAgent.js';

export { default as FieldClassifier } from './fieldClassifier.js';
export type {
  ClassifiedField,
  FieldClassificationResult,
  FieldPattern
} from './fieldClassifier.js';

export { default as PromptGenerator } from './promptGenerator.js';
export type {
  PromptTemplate,
  PromptExample,
  PromptGenerationOptions,
  GeneratedPrompt
} from './promptGenerator.js';

export { default as SafetyValidator } from './safetyValidator.js';
export type {
  SafetyConfig,
  SafetyRule,
  SafetyCheckResult,
  SafetyViolation,
  ValidationResult,
  HallucinationIndicator,
  PIIDetectionResult,
  PIIType
} from './safetyValidator.js';

export { default as FallbackHandler } from './fallbackHandler.js';
export type {
  FallbackStrategy,
  FallbackTemplate,
  FallbackConfig,
  FallbackAnalysis
} from './fallbackHandler.js';

export { default as TokenBudgetManager } from './tokenBudgetManager.js';
export type {
  TokenBudget,
  PlatformLimits,
  ModelLimits,
  TokenEstimation,
  BudgetCheckResult,
  TruncationStrategy,
  UsageTracking
} from './tokenBudgetManager.js';

// Re-export test utilities for consumers who want to test their integrations
export { SmartAIAgentTestSuite } from '../tests/testAgentOutput.js';
export type {
  TestCase,
  TestResult,
  TestSuiteResult,
  TestCategory,
  AssertionResult
} from '../tests/testAgentOutput.js';