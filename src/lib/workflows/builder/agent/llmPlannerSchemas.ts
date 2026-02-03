/**
 * Zod Schemas for LLM Planner Output Validation
 *
 * These schemas ensure that LLM outputs are properly structured
 * before being used to generate workflow edits.
 */

import { z } from 'zod'

// ============================================================================
// CONFIDENCE & REASONING
// ============================================================================

export const ConfigConfidenceSchema = z.enum(['high', 'medium', 'low'])

export const PlanningPhaseSchema = z.enum([
  'understanding',
  'selecting',
  'ordering',
  'configuring',
  'connecting',
  'validating',
])

export const ReasoningStepSchema = z.object({
  step: z.number().int().positive(),
  phase: PlanningPhaseSchema,
  thought: z.string(),
  decision: z.string().optional(),
  confidence: ConfigConfidenceSchema.optional(),
  alternatives: z.array(z.string()).optional(),
})

// ============================================================================
// NODE SELECTION
// ============================================================================

export const PlannedNodeSchema = z.object({
  type: z.string(),
  position: z.number().int().positive(),
  label: z.string().optional(),
  config: z.record(z.any()).optional(),
  confidence: ConfigConfidenceSchema,
  reasoning: z.string(),
  branchId: z.string().optional(),
  lane: z.number().int().optional(),
})

export const PlannedEdgeSchema = z.object({
  fromPosition: z.number().int().positive(),
  toPosition: z.number().int().positive(),
  label: z.string().optional(),
  condition: z.object({
    field: z.string(),
    operator: z.enum([
      'equals',
      'not_equals',
      'contains',
      'not_contains',
      'greater_than',
      'less_than',
      'is_empty',
      'is_not_empty',
      'matches_regex',
      'custom_expression',
    ]),
    value: z.any().optional(),
    expression: z.string().optional(),
  }).optional(),
})

// ============================================================================
// PARTIAL CONFIGURATION
// ============================================================================

export const AIConfiguredFieldSchema = z.object({
  value: z.any(),
  confidence: ConfigConfidenceSchema,
  reason: z.string(),
})

export const UserRequiredFieldSchema = z.object({
  fieldName: z.string(),
  fieldLabel: z.string(),
  fieldType: z.string(),
  reason: z.string(),
  suggestions: z.array(z.string()).optional(),
})

export const DynamicPendingFieldSchema = z.object({
  fieldName: z.string(),
  fieldLabel: z.string(),
  dependsOn: z.string().optional(),
  apiEndpoint: z.string().optional(),
})

export const NodeConfigurationSchema = z.object({
  aiConfigured: z.record(AIConfiguredFieldSchema),
  userRequired: z.array(UserRequiredFieldSchema),
  dynamicPending: z.array(DynamicPendingFieldSchema),
  completeness: z.number().min(0).max(1),
})

// ============================================================================
// BRANCHING
// ============================================================================

export const BranchConditionSchema = z.object({
  field: z.string(),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'greater_than',
    'less_than',
    'is_empty',
    'is_not_empty',
    'matches_regex',
    'custom_expression',
  ]),
  value: z.any().optional(),
  expression: z.string().optional(),
})

export const ConditionalBranchSchema = z.object({
  id: z.string(),
  label: z.string(),
  conditions: z.array(BranchConditionSchema),
  conditionLogic: z.enum(['and', 'or']),
  nodeIds: z.array(z.string()),
})

export const BranchLayoutSchema = z.object({
  mainLaneX: z.number(),
  branchSpacing: z.number(),
  branches: z.array(z.object({
    branchId: z.string(),
    laneIndex: z.number().int(),
    xPosition: z.number(),
  })),
})

// ============================================================================
// LLM PLANNER OUTPUT
// ============================================================================

export const LLMPlannerOutputSchema = z.object({
  nodes: z.array(PlannedNodeSchema),
  edges: z.array(PlannedEdgeSchema),
  reasoning: z.array(ReasoningStepSchema),
  partialConfigs: z.record(NodeConfigurationSchema),
  confidence: ConfigConfidenceSchema,
  branches: z.array(ConditionalBranchSchema).optional(),
  branchLayout: BranchLayoutSchema.optional(),
  planVersion: z.number().int().positive(),
  workflowName: z.string().optional(),
  prerequisites: z.array(z.string()),
})

// ============================================================================
// NODE SELECTION RESPONSE (Stage 1)
// ============================================================================

// Flexible reasoning that accepts both string arrays and object arrays
// LLMs sometimes return strings instead of structured objects
const FlexibleReasoningSchema = z.union([
  z.array(ReasoningStepSchema),
  z.array(z.string()).transform((strings) =>
    strings.map((s, i) => ({
      step: i + 1,
      phase: 'understanding' as const,
      thought: s,
    }))
  ),
])

export const NodeSelectionResponseSchema = z.object({
  selectedNodes: z.array(z.object({
    type: z.string(),
    position: z.number().int().positive(),
    reasoning: z.string(),
    confidence: ConfigConfidenceSchema,
  })),
  reasoning: FlexibleReasoningSchema,
  hasBranching: z.boolean(),
  branchPoints: z.array(z.object({
    afterPosition: z.number().int().positive(),
    condition: z.string(),
    trueBranch: z.array(z.string()),
    falseBranch: z.array(z.string()).optional(),
  })).optional(),
  workflowName: z.string().optional(),
})

// ============================================================================
// NODE CONFIGURATION RESPONSE (Stage 2)
// ============================================================================

// Helper to convert numeric confidence to string
// LLMs sometimes return 0.8 instead of 'high'
const numericToStringConfidence = (val: unknown): 'high' | 'medium' | 'low' => {
  if (typeof val === 'string' && ['high', 'medium', 'low'].includes(val)) {
    return val as 'high' | 'medium' | 'low'
  }
  if (typeof val === 'number') {
    if (val >= 0.7) return 'high'
    if (val >= 0.4) return 'medium'
    return 'low'
  }
  return 'medium' // default
}

// Flexible confidence that accepts both string enum and numbers
const FlexibleConfidenceSchema = z.union([
  ConfigConfidenceSchema,
  z.number().transform(numericToStringConfidence),
]).catch('medium')

// Flexible fieldConfidence that accepts:
// - { confidence: 'high', reason: '...' } (expected)
// - { confidence: 0.8, reason: '...' } (number confidence)
// - 0.8 (just a number)
// - 'high' (just a string)
const FlexibleFieldConfidenceSchema = z.union([
  z.object({
    confidence: FlexibleConfidenceSchema,
    reason: z.string(),
  }),
  z.number().transform((n) => ({
    confidence: numericToStringConfidence(n),
    reason: 'AI configured',
  })),
  z.string().transform((s) => ({
    confidence: numericToStringConfidence(s),
    reason: 'AI configured',
  })),
])

// Flexible userRequiredFields that accepts:
// - { field: 'name', reason: '...' } (expected)
// - 'fieldName' (just a string)
const FlexibleUserRequiredFieldSchema = z.union([
  z.object({
    field: z.string(),
    reason: z.string(),
  }),
  z.string().transform((s) => ({
    field: s,
    reason: 'User input required',
  })),
])

export const NodeConfigurationResponseSchema = z.object({
  configurations: z.record(z.object({
    config: z.record(z.any()),
    confidence: FlexibleConfidenceSchema,
    fieldConfidence: z.record(FlexibleFieldConfidenceSchema),
    userRequiredFields: z.array(FlexibleUserRequiredFieldSchema),
    dynamicFields: z.array(z.string()),
  })),
  variableMappings: z.record(z.string()).optional().default({}), // nodeField -> sourceVariable
})

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type NodeSelectionResponse = z.infer<typeof NodeSelectionResponseSchema>
export type NodeConfigurationResponse = z.infer<typeof NodeConfigurationResponseSchema>
export type LLMPlannerOutputParsed = z.infer<typeof LLMPlannerOutputSchema>
