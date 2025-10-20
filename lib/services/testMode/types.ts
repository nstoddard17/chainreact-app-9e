/**
 * Test/Sandbox Mode Configuration
 *
 * Defines how workflows execute in test mode:
 * - Trigger behavior (wait for real data vs use mock data)
 * - Action behavior (intercept external sends, allow reads)
 * - Data capture and display
 */

export enum TriggerTestMode {
  /** Wait for real webhook/trigger to fire, capture real data, then continue in sandbox */
  WAIT_FOR_REAL = 'wait_for_real',

  /** Skip trigger entirely, use mock data immediately */
  USE_MOCK_DATA = 'use_mock_data'
}

export enum ActionTestMode {
  /** Execute reads/gets normally, intercept all sends/creates/updates */
  INTERCEPT_WRITES = 'intercept_writes',

  /** Skip all external actions entirely, use mock responses */
  SKIP_ALL = 'skip_all'
}

export interface TestModeConfig {
  /** How to handle the trigger */
  triggerMode: TriggerTestMode

  /** How to handle actions */
  actionMode: ActionTestMode

  /** Maximum time to wait for trigger (ms) - only applies to WAIT_FOR_REAL */
  triggerTimeout?: number

  /** Whether to show detailed step-by-step execution in UI */
  showDetailedSteps?: boolean

  /** Whether to capture and display data at each step */
  captureStepData?: boolean
}

export interface TestSessionState {
  /** Unique session ID */
  sessionId: string

  /** Workflow ID being tested */
  workflowId: string

  /** User ID */
  userId: string

  /** Test configuration */
  config: TestModeConfig

  /** Whether waiting for trigger */
  waitingForTrigger: boolean

  /** Data captured from trigger (when available) */
  triggerData?: any

  /** Steps executed so far */
  executedSteps: Array<{
    nodeId: string
    nodeType: string
    status: 'success' | 'failed' | 'skipped' | 'intercepted'
    input?: any
    output?: any
    intercepted?: {
      action: string
      wouldHaveSent: any
      destination: string
    }
    timestamp: string
    duration: number
  }>

  /** Current step being executed */
  currentStep?: string

  /** Test started timestamp */
  startedAt: string

  /** Test completed timestamp */
  completedAt?: string

  /** Overall status */
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'timeout'
}

export interface MockTriggerData {
  /** Trigger type */
  type: string

  /** Mock data structure */
  data: any

  /** Description of what this mock data represents */
  description: string

  /** Optional variations of mock data */
  variations?: {
    name: string
    data: any
    description: string
  }[]
}
