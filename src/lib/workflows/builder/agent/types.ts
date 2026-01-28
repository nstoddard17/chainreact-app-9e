/**
 * LLM-Powered Workflow Planner Types
 *
 * This module defines types for the new LLM-based planning system that supports:
 * - 10-15+ node workflows from a single prompt
 * - Conversational refinement ("add a filter before step 3")
 * - Visible reasoning/rationale for choices
 * - Partial configuration with confidence scores
 * - Branching and conditional logic
 */

import type { Edit, PlannerResult } from './planner'
import type { Node, Edge } from '../schema'

// ============================================================================
// REASONING & TRANSPARENCY
// ============================================================================

/**
 * Phases of the planning process
 */
export type PlanningPhase =
  | 'understanding'  // Parsing and interpreting user intent
  | 'selecting'      // Choosing which nodes to use
  | 'ordering'       // Determining node sequence and flow
  | 'configuring'    // Setting up node configurations
  | 'connecting'     // Creating edges between nodes
  | 'validating'     // Checking the plan for errors

/**
 * A single step in the AI's reasoning process, shown to users
 * for transparency about how decisions were made.
 */
export interface ReasoningStep {
  step: number
  phase: PlanningPhase
  thought: string       // What the AI is considering
  decision?: string     // What decision was made (if any)
  confidence?: 'high' | 'medium' | 'low'
  alternatives?: string[] // Other options considered
}

// ============================================================================
// PARTIAL CONFIGURATION
// ============================================================================

/**
 * Confidence level for AI-configured field values
 */
export type ConfigConfidence = 'high' | 'medium' | 'low'

/**
 * A field value that was set by AI with confidence metadata
 */
export interface AIConfiguredField {
  value: any
  confidence: ConfigConfidence
  reason: string  // Why this value was chosen
}

/**
 * A field that requires user input
 */
export interface UserRequiredField {
  fieldName: string
  fieldLabel: string
  fieldType: string
  reason: string  // Why AI couldn't configure this
  suggestions?: string[]  // Potential values user might choose
}

/**
 * A field that needs API data to be loaded
 */
export interface DynamicPendingField {
  fieldName: string
  fieldLabel: string
  dependsOn?: string  // Field that must be set first
  apiEndpoint?: string  // Which API will load options
}

/**
 * Configuration status for a single node
 */
export interface NodeConfiguration {
  /** Fields successfully configured by AI with confidence */
  aiConfigured: Record<string, AIConfiguredField>
  /** Fields that require user input */
  userRequired: UserRequiredField[]
  /** Fields waiting for dynamic options from API */
  dynamicPending: DynamicPendingField[]
  /** Overall configuration completeness (0-1) */
  completeness: number
}

// ============================================================================
// BRANCHING & CONDITIONAL LOGIC
// ============================================================================

/**
 * Condition types for branching
 */
export type ConditionType =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty'
  | 'matches_regex'
  | 'custom_expression'

/**
 * A condition for branching logic
 */
export interface BranchCondition {
  field: string           // Variable reference like {{trigger.status}}
  operator: ConditionType
  value?: any             // Comparison value
  expression?: string     // For custom_expression type
}

/**
 * A branch in a conditional workflow
 */
export interface ConditionalBranch {
  id: string
  label: string           // "If urgent", "Otherwise", etc.
  conditions: BranchCondition[]
  conditionLogic: 'and' | 'or'
  nodeIds: string[]       // Nodes in this branch path
}

/**
 * Layout information for branching
 */
export interface BranchLayout {
  mainLaneX: number       // X position of main lane (default: 0)
  branchSpacing: number   // Horizontal spacing between branches (default: 400)
  branches: Array<{
    branchId: string
    laneIndex: number     // 0 = main, 1 = first branch, etc.
    xPosition: number
  }>
}

// ============================================================================
// LLM PLANNER INPUT/OUTPUT
// ============================================================================

/**
 * Extended input for LLM-based planning
 */
export interface LLMPlannerInput {
  prompt: string
  flow: { nodes: Node[]; edges: Edge[] }
  connectedIntegrations?: string[]
  conversationHistory?: ConversationMessage[]
  /** If true, this is a refinement of an existing plan */
  isRefinement?: boolean
  /** Previous plan version for refinement context */
  previousPlanVersion?: number
}

/**
 * A message in the planning conversation
 */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  metadata?: ChatMessageMeta
}

/**
 * Metadata stored with chat messages for persistence
 */
export interface ChatMessageMeta {
  reasoningSteps?: ReasoningStep[]
  planVersion?: number
  workflowSnapshot?: string  // JSON serialized flow state
  partialConfigs?: Record<string, NodeConfiguration>
  isRefinement?: boolean
  refinementType?: RefinementType
}

/**
 * A planned node before it's converted to an Edit operation
 */
export interface PlannedNode {
  type: string
  position: number        // Order in the workflow (1, 2, 3...)
  label?: string          // Optional custom label
  config?: Record<string, any>
  confidence: ConfigConfidence
  reasoning: string       // Why this node was chosen
  /** For branching: which branch this node belongs to */
  branchId?: string
  /** For branching: lane position */
  lane?: number
}

/**
 * A planned edge before it's converted to an Edit operation
 */
export interface PlannedEdge {
  fromPosition: number    // Position of source node
  toPosition: number      // Position of target node
  label?: string          // For conditional edges
  condition?: BranchCondition
}

/**
 * Output from the LLM planner
 */
export interface LLMPlannerOutput {
  /** Planned nodes to create */
  nodes: PlannedNode[]
  /** Planned edges to create */
  edges: PlannedEdge[]
  /** Step-by-step reasoning shown to user */
  reasoning: ReasoningStep[]
  /** Configuration status per node type */
  partialConfigs: Record<string, NodeConfiguration>
  /** Overall plan confidence */
  confidence: ConfigConfidence
  /** Branches if workflow has conditional logic */
  branches?: ConditionalBranch[]
  /** Layout hints for branches */
  branchLayout?: BranchLayout
  /** Version number for refinement tracking */
  planVersion: number
  /** Suggested workflow name */
  workflowName?: string
  /** Prerequisites (integrations, secrets, etc.) */
  prerequisites: string[]
}

// ============================================================================
// REFINEMENT OPERATIONS
// ============================================================================

/**
 * Types of refinement operations
 */
export type RefinementType =
  | 'add_node'            // "add a filter before step 3"
  | 'remove_node'         // "remove the email step"
  | 'replace_node'        // "use Trello instead of GitHub"
  | 'move_node'           // "move the AI step to the end"
  | 'modify_config'       // "change the Slack channel"
  | 'add_branch'          // "add a condition if urgent"
  | 'merge_branches'      // "combine the two paths"
  | 'reorder'             // "swap steps 2 and 3"
  | 'clarify'             // Not a modification, just explanation

/**
 * Position reference for refinements
 */
export interface PositionReference {
  type: 'before' | 'after' | 'replace' | 'at_start' | 'at_end'
  /** Reference can be step number, node type, or node label */
  reference: string | number
}

/**
 * Parsed refinement intent from user message
 */
export interface RefinementIntent {
  type: RefinementType
  position?: PositionReference
  /** Target node(s) for the operation */
  targetNodeTypes?: string[]
  /** New node type (for add/replace) */
  newNodeType?: string
  /** Config changes (for modify_config) */
  configChanges?: Record<string, any>
  /** Condition for branching */
  condition?: BranchCondition
  /** Raw matched text that triggered this intent */
  matchedText: string
  /** Confidence in the parsed intent */
  confidence: ConfigConfidence
}

/**
 * Result of applying a refinement
 */
export interface RefinementResult {
  success: boolean
  edits: Edit[]
  reasoning: ReasoningStep[]
  error?: string
  /** Updated plan version */
  newPlanVersion: number
}

// ============================================================================
// EXTENDED EDIT OPERATIONS (for branching support)
// ============================================================================

/**
 * Extended Edit type that includes branching operations
 */
export type ExtendedEdit =
  | Edit
  | { op: 'addBranch'; afterNodeId: string; condition: BranchCondition; truePath: Node[]; falsePath?: Node[] }
  | { op: 'mergeBranches'; sourceNodeIds: string[]; mergeNodeId: string }
  | { op: 'removeNode'; nodeId: string; reconnect: boolean }
  | { op: 'moveNode'; nodeId: string; newPosition: PositionReference }

/**
 * Extended planner result with branching support
 */
export interface ExtendedPlannerResult extends PlannerResult {
  reasoning?: ReasoningStep[]
  partialConfigs?: Record<string, NodeConfiguration>
  planVersion?: number
  branches?: ConditionalBranch[]
  branchLayout?: BranchLayout
}

// ============================================================================
// COMPACT NODE CATALOG (for LLM context efficiency)
// ============================================================================

/**
 * Compact node entry for LLM context (~50 tokens vs ~500 for full)
 * Used in Tier 1 (node selection) before loading full schemas in Tier 2
 */
export interface CompactNodeEntry {
  /** Unique identifier like "gmail_trigger_new_email" */
  type: string
  /** Provider name like "gmail", "slack", "notion" */
  provider: string
  /** Category: "trigger" | "action" | "logic" | "ai" | "automation" */
  category: 'trigger' | 'action' | 'logic' | 'ai' | 'automation' | 'utility'
  /** Short description (max 60 chars) */
  desc: string
  /** Whether this node requires OAuth authentication */
  requiresAuth: boolean
  /** Tags for better matching */
  tags?: string[]
}

/**
 * Grouped catalog for efficient prompt construction
 */
export interface GroupedNodeCatalog {
  triggers: CompactNodeEntry[]
  actions: CompactNodeEntry[]
  logic: CompactNodeEntry[]
  ai: CompactNodeEntry[]
  automation: CompactNodeEntry[]
  utility: CompactNodeEntry[]
}

/**
 * Token estimation for catalog
 */
export interface CatalogStats {
  totalNodes: number
  totalTokens: number
  byProvider: Record<string, number>
  byCategory: Record<string, number>
}

// ============================================================================
// ZOD SCHEMAS FOR LLM OUTPUT VALIDATION
// ============================================================================

// Note: Zod schemas are defined in a separate file to avoid circular imports
// See: ./llmPlannerSchemas.ts

// ============================================================================
// STREAMING EVENTS
// ============================================================================

/**
 * Events emitted during streaming planning
 */
export type PlanningStreamEvent =
  | { type: 'reasoning'; step: ReasoningStep }
  | { type: 'node_selected'; node: PlannedNode }
  | { type: 'partial_config'; nodeType: string; config: NodeConfiguration }
  | { type: 'branch_creating'; branch: ConditionalBranch }
  | { type: 'plan_complete'; result: LLMPlannerOutput }
  | { type: 'error'; message: string }
