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

export const NodeSelectionResponseSchema = z.object({
  selectedNodes: z.array(z.object({
    type: z.string(),
    position: z.number().int().positive(),
    reasoning: z.string(),
    confidence: ConfigConfidenceSchema,
  })),
  reasoning: z.array(ReasoningStepSchema),
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

export const NodeConfigurationResponseSchema = z.object({
  configurations: z.record(z.object({
    config: z.record(z.any()),
    confidence: ConfigConfidenceSchema,
    fieldConfidence: z.record(z.object({
      confidence: ConfigConfidenceSchema,
      reason: z.string(),
    })),
    userRequiredFields: z.array(z.object({
      field: z.string(),
      reason: z.string(),
    })),
    dynamicFields: z.array(z.string()),
  })),
  variableMappings: z.record(z.string()), // nodeField -> sourceVariable
})

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type NodeSelectionResponse = z.infer<typeof NodeSelectionResponseSchema>
export type NodeConfigurationResponse = z.infer<typeof NodeConfigurationResponseSchema>
export type LLMPlannerOutputParsed = z.infer<typeof LLMPlannerOutputSchema>
