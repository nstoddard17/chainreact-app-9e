/**
 * copy.ts
 *
 * Centralized copy strings for the V2 Flow Builder.
 * Ensures consistent wording matching Kadabra-style UX.
 */

export const Copy = {
  // Agent thinking states
  thinking: "Agent is thinking…",
  breakingDown: "Breaking down task…",
  collectingNodes: "Collecting nodes…",
  outliningFlow: "Outlining flow…",
  definingPurpose: "Defining purpose…",

  // Staged text content
  subtasks: "Broke the task into smaller subtasks for retrieving relevant nodes",
  collected: "Collected all relevant nodes for the flow",
  outline: "Outline the flow to achieve the task",

  // Plan UI
  planTitle: "Flow implementation plan.",
  purposeLabel: "Purpose:",
  planReadyCta: "Build",
  planReady: "Plan ready",
  executePlan: "Let's execute next steps:",

  // Building states
  buildingSkeleton: "Building the skeleton of the flow",
  agentBadge: "Agent building flow",
  waitingUser: "Waiting for user action",
  preparingNode: "Preparing node…",
  testingNode: "Testing node…",
  flowReady: "Flow ready ✅",
  yourFlowReady: "Your flow is ready",

  // User actions
  undo: "Undo to Previous Stage",
  cancel: "Cancel Build",
  moveOn: "Move on to setup nodes and test one by one",
  continue: "Continue",
  skip: "Skip",
  testNow: "Test now",
  setupRequired: "Setup required",

  // Inspector tabs (exact order and text)
  tabs: {
    config: "Config",
    input: "Input",
    output: "Output",
    errors: "Errors",
    lineage: "Lineage",
    cost: "Cost",
  },

  // Status messages
  preparing: (nodeTitle?: string) =>
    nodeTitle ? `Preparing ${nodeTitle}…` : "Preparing node…",
  testing: (nodeTitle?: string) =>
    nodeTitle ? `Testing ${nodeTitle}…` : "Testing node…",
} as const

// Re-export individual categories for convenience
export const AgentStates = {
  thinking: Copy.thinking,
  breakingDown: Copy.breakingDown,
  collectingNodes: Copy.collectingNodes,
  outliningFlow: Copy.outliningFlow,
  definingPurpose: Copy.definingPurpose,
} as const

export const StagedContent = {
  subtasks: Copy.subtasks,
  collected: Copy.collected,
  outline: Copy.outline,
} as const

export const BuildActions = {
  undo: Copy.undo,
  cancel: Copy.cancel,
  continue: Copy.continue,
  skip: Copy.skip,
  testNow: Copy.testNow,
} as const
