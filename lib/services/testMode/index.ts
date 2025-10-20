/**
 * Test/Sandbox Mode Module
 *
 * Comprehensive test mode system for workflow execution
 * Supports both trigger and action testing scenarios
 */

export {
  TriggerTestMode,
  ActionTestMode,
  type TestModeConfig,
  type TestSessionState,
  type MockTriggerData
} from './types'

export {
  MOCK_TRIGGER_DATA,
  getMockTriggerData,
  getTriggerVariations,
  getTriggerMockDescription
} from './mockTriggerData'

/**
 * Create a default test mode configuration
 */
export function createDefaultTestConfig(options?: Partial<TestModeConfig>): TestModeConfig {
  return {
    triggerMode: options?.triggerMode || TriggerTestMode.USE_MOCK_DATA,
    actionMode: options?.actionMode || ActionTestMode.INTERCEPT_WRITES,
    showDetailedSteps: options?.showDetailedSteps ?? true,
    captureStepData: options?.captureStepData ?? true,
    triggerTimeout: options?.triggerTimeout
  }
}

/**
 * Create a test config that waits for real trigger data
 */
export function createWaitForTriggerConfig(timeoutMs: number = 300000): TestModeConfig {
  return {
    triggerMode: TriggerTestMode.WAIT_FOR_REAL,
    actionMode: ActionTestMode.INTERCEPT_WRITES,
    triggerTimeout: timeoutMs,
    showDetailedSteps: true,
    captureStepData: true
  }
}

/**
 * Create a test config that uses mock data and skips all external actions
 */
export function createFullMockConfig(): TestModeConfig {
  return {
    triggerMode: TriggerTestMode.USE_MOCK_DATA,
    actionMode: ActionTestMode.SKIP_ALL,
    showDetailedSteps: true,
    captureStepData: true
  }
}

import { TriggerTestMode, ActionTestMode, TestModeConfig } from './types'
