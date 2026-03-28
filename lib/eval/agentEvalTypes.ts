/**
 * Agent Evaluation Framework - Type Definitions
 *
 * Central type definitions for the agent eval event taxonomy,
 * metadata shapes, failure classification, and dashboard data.
 */

// Current agent version - bump when shipping agent changes
export const AGENT_VERSION = '1.0.0'

// ─── Event Names ───────────────────────────────────────────────

export const AGENT_EVAL_EVENTS = {
  // Funnel
  PROMPT_SUBMITTED: 'agent.prompt_submitted',
  PLAN_GENERATED: 'agent.plan_generated',
  PLAN_APPROVED: 'agent.plan_approved',
  PLAN_REJECTED: 'agent.plan_rejected',
  BUILD_STARTED: 'agent.build_started',
  BUILD_COMPLETED: 'agent.build_completed',
  ACTIVATION_ATTEMPTED: 'agent.activation_attempted',
  ACTIVATION_SUCCEEDED: 'agent.activation_succeeded',
  ACTIVATION_BLOCKED: 'agent.activation_blocked',
  ACTIVATION_UNBLOCKED: 'agent.activation_unblocked',
  // Quality
  CLARIFICATION_ASKED: 'agent.clarification_asked',
  CLARIFICATION_ANSWERED: 'agent.clarification_answered',
  MANUAL_CORRECTION: 'agent.manual_correction',
  DUPLICATE_NODE: 'agent.duplicate_node',
  INVALID_VARIABLE_REF: 'agent.invalid_variable_ref',
  HALLUCINATED_FIELD: 'agent.hallucinated_field',
  // Drafting
  DRAFTING_OPEN_ITEM_ADDED: 'agent.drafting_open_item_added',
  DRAFTING_ITEM_RESOLVED: 'agent.drafting_item_resolved',
  DRAFTING_OVERRIDE: 'agent.drafting_override',
  DRAFTING_REASK_RESOLVED: 'agent.drafting_reask_resolved',
  // Trust
  STATE_TRANSITION: 'agent.state_transition',
  TRIGGER_NEEDS_SETUP: 'agent.trigger_needs_setup',
  PROVIDER_CONNECT_BLOCKER: 'agent.provider_connect_blocker',
  PROVIDER_CONNECT_CTA_SHOWN: 'agent.provider_connect_cta_shown',
  PROVIDER_CONNECT_CTA_CLICKED: 'agent.provider_connect_cta_clicked',
  PROVIDER_OAUTH_SUCCESS: 'agent.provider_oauth_success',
  BUILD_ENABLED_AFTER_RECOVERY: 'agent.build_enabled_after_recovery',
  NODE_TEST_RESULT: 'agent.node_test_result',
} as const

export type AgentEvalEventName = typeof AGENT_EVAL_EVENTS[keyof typeof AGENT_EVAL_EVENTS]

// ─── Event Categories ──────────────────────────────────────────

export type EventCategory = 'funnel' | 'quality' | 'drafting' | 'trust'

export function getEventCategory(eventName: AgentEvalEventName): EventCategory {
  if (eventName.startsWith('agent.drafting_')) return 'drafting'
  if (eventName.startsWith('agent.activation') || eventName.startsWith('agent.prompt') ||
      eventName.startsWith('agent.plan') || eventName.startsWith('agent.build')) return 'funnel'
  if (['agent.clarification_asked', 'agent.clarification_answered', 'agent.manual_correction',
       'agent.duplicate_node', 'agent.invalid_variable_ref', 'agent.hallucinated_field'].includes(eventName)) return 'quality'
  return 'trust'
}

// ─── Context Types ─────────────────────────────────────────────

export type ContextType = 'none' | 'manual' | 'auto' | 'auto+drafting'
export type PlannerPath = 'llm_3stage' | 'pattern_fast' | 'pattern_db' | 'llm_mini' | 'clarify'
export type PromptType = 'simple' | 'moderate' | 'complex'
export type SessionOutcome = 'activated' | 'blocked' | 'abandoned'
export type CorrectionType = 'field_change' | 'node_swap' | 'node_remove' | 'node_add'
export type CorrectionSeverity = 'minor' | 'moderate' | 'major'
export type ClarificationType = 'provider' | 'field' | 'goal' | 'missing_context' | 'ambiguous_trigger' | 'scope' | 'data_mapping'
export type FailureLabel = 'understanding_failure' | 'mapping_failure' | 'structure_failure' | 'config_failure'

// ─── Prompt Complexity Classifier ──────────────────────────────

export function classifyPromptComplexity(
  promptLength: number,
  connectedIntegrations: string[]
): PromptType {
  const providerCount = connectedIntegrations.length
  // Simple heuristic based on provider count and prompt length
  if (providerCount <= 1 && promptLength < 100) return 'simple'
  if (providerCount >= 3 || promptLength > 300) return 'complex'
  return 'moderate'
}

// ─── Failure Label Classifier ──────────────────────────────────

export function classifyFailure(
  eventName: AgentEvalEventName,
  metadata: Record<string, unknown>
): FailureLabel[] {
  const labels: FailureLabel[] = []

  switch (eventName) {
    case AGENT_EVAL_EVENTS.MANUAL_CORRECTION: {
      const correctionType = metadata.correction_type as CorrectionType | undefined
      if (correctionType === 'node_swap' || correctionType === 'node_remove') {
        labels.push('understanding_failure')
      }
      if (correctionType === 'node_add') {
        labels.push('structure_failure')
      }
      if (correctionType === 'field_change') {
        const variableRef = metadata.variable_ref as string | undefined
        if (variableRef) {
          labels.push('mapping_failure')
        } else {
          labels.push('config_failure')
        }
      }
      break
    }
    case AGENT_EVAL_EVENTS.INVALID_VARIABLE_REF:
      labels.push('mapping_failure')
      break
    case AGENT_EVAL_EVENTS.HALLUCINATED_FIELD:
      labels.push('config_failure')
      break
    case AGENT_EVAL_EVENTS.DUPLICATE_NODE:
      labels.push('structure_failure')
      break
  }

  return labels.length > 0 ? labels : ['config_failure']
}

// ─── Event Shape (what gets sent to the API) ───────────────────

export interface AgentEvalEvent {
  event_name: AgentEvalEventName
  category: EventCategory
  session_id: string
  conversation_id: string
  flow_id: string | null
  agent_version: string
  session_outcome: SessionOutcome | null
  planner_path: PlannerPath | null
  llm_model: string | null
  turn_number: number
  prompt_type: PromptType | null
  time_since_last_turn_ms: number | null
  metadata: Record<string, unknown>
}

// ─── Dashboard Data Interfaces ─────────────────────────────────

export interface FunnelStep {
  stage: string
  count: number
  conversion_pct: number // % of previous stage
}

export interface KPIData {
  value: number | string
  previous_value: number | string
  delta: number
  trend: 'up' | 'down' | 'flat'
  is_good: boolean // whether the trend direction is positive
}

export interface DailyCount {
  date: string
  count: number
}

export interface QualityIssue {
  date: string
  conversation_id: string
  event_type: string
  failure_label: string | null
  severity: CorrectionSeverity | null
  node_type: string | null
}

export interface ContextGroupMetrics {
  context_type: ContextType
  session_count: number
  plan_approval_pct: number
  build_completion_pct: number
  activation_pct: number
  avg_follow_up_turns: number
  effectiveness_score: number
}

export interface SampledSession {
  conversation_id: string
  date: string
  prompt_preview: string | null
  node_count: number
  context_type: ContextType
  quality_event_count: number
  correction_count: number
  max_severity: CorrectionSeverity | null
  outcome: SessionOutcome
  agent_version: string
  planner_path: PlannerPath | null
  turns_to_success: number | null
}

export interface SessionEvent {
  timestamp: string
  event_name: AgentEvalEventName
  category: EventCategory
  detail: string
  metadata: Record<string, unknown>
}

export interface FunnelDashboardData {
  kpis: {
    activation_rate: KPIData
    first_plan_accept: KPIData
    turns_to_success: KPIData
    build_completion: KPIData
    invalid_variable_rate: KPIData
    top_failure: KPIData
  }
  funnel: FunnelStep[]
  daily_activations: DailyCount[]
  biggest_dropoff: { from: string; to: string; pct_lost: number } | null
}

export interface QualityDashboardData {
  mini_kpis: {
    first_plan_accept_pct: KPIData
    clarification_rate: KPIData
    manual_correction_rate: KPIData
    severity_breakdown: { minor: number; moderate: number; major: number }
    duplicate_node_rate: KPIData
    hallucinated_field_count: KPIData
  }
  weekly_trends: Array<{
    week: string
    first_plan_accept: number
    correction_rate: number
    agent_version: string
  }>
  failure_label_breakdown: Record<FailureLabel, number>
  recent_issues: QualityIssue[]
}

export interface ContextDashboardData {
  groups: ContextGroupMetrics[]
  best_group: ContextType | null
  summary: string
}

export interface TrustDashboardData {
  node_test_pass_rate: KPIData
  activation_blocked_count: KPIData
  median_resolution_time_ms: KPIData
  provider_blockers: KPIData
  blocked_reasons: Array<{ reason: string; count: number; pct: number }>
  weekly_trends: Array<{
    week: string
    test_pass_rate: number
    activation_success_rate: number
  }>
}

export interface AgentEvalDashboardData {
  funnel: FunnelDashboardData
  quality: QualityDashboardData
  context: ContextDashboardData
  trust: TrustDashboardData
  sampled_sessions: SampledSession[]
  period: { days: number; start: string; end: string }
  agent_version: string
}
