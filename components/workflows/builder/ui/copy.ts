/**
 * copy.ts
 *
 * Centralized copy strings for the V2 Flow Builder.
 * Ensures consistent wording matching Kadabra-style UX.
 */

export const Copy = {
  // Agent planning states
  thinking: "Agent is thinking…",
  understanding: "Analyzing your apps and triggers…",
  designing: "Mapping actions and connections…",
  designingExtended: "Optimizing your workflow…",

  // Plan UI
  planTitle: "Flow implementation plan.",
  purposeLabel: "Purpose:",
  planReadyCta: "Build",
  planReady: "Plan ready",
  executePlan: "Let's execute next steps:",

  // Building states
  buildingSkeleton: "Building the skeleton of the flow",
  agentBadge: "Agent building flow",
  completeStep: "Complete this step to continue",
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
  understanding: Copy.understanding,
  designing: Copy.designing,
} as const

export const BuildActions = {
  undo: Copy.undo,
  cancel: Copy.cancel,
  continue: Copy.continue,
  skip: Copy.skip,
  testNow: Copy.testNow,
} as const
