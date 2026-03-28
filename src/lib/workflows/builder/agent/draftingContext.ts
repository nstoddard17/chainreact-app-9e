/**
 * DraftingContext — Lightweight structured state for multi-turn workflow creation.
 *
 * Tracks the user's goal, resolved decisions, open items, and readiness phase
 * across conversation turns. Updated deterministically (no extra LLM calls).
 *
 * - Persisted to localStorage via WorkflowDraftState
 * - Passed to the LLM planner as a compact context block
 * - NOT stored in DB chat messages (ephemeral drafting state only)
 */

// ============================================================================
// TYPES
// ============================================================================

export type DraftingPhase = 'gathering' | 'planning' | 'refining' | 'ready'

/**
 * Whether the decision was explicitly confirmed by the user or inferred by the system.
 * - 'explicit': user typed a specific app name, selected from dropdown, or answered a question
 * - 'inferred': system auto-selected (e.g. only one connected provider) or LLM default
 */
export type ResolutionSource = 'explicit' | 'inferred'

export interface ResolvedDecision {
  key: string            // e.g. "email_provider", "trigger_type"
  label: string          // Human-readable: "Email provider"
  value: string          // "gmail", "outlook", etc.
  source: ResolutionSource
  resolvedAt: string     // ISO timestamp
}

export interface OpenItem {
  key: string            // e.g. "notification_provider", "filter_condition"
  label: string          // "Which notification service?"
  reason: string         // "User said 'send a notification' but didn't specify"
  priority: 'blocking' | 'optional'
}

export interface DraftingContext {
  /** What the user is trying to build — extracted from first prompt, refined over turns */
  goal: string

  /** Structured decisions that have been made */
  resolved: ResolvedDecision[]

  /** Items still needed before the workflow can be finalized */
  openItems: OpenItem[]

  /** The agent's recommended next action or question */
  nextAction: string

  /** Overall readiness */
  phase: DraftingPhase

  /** How many conversation turns have contributed to this context */
  turnCount: number

  /** Last updated timestamp */
  updatedAt: string
}

// ============================================================================
// EVENTS
// ============================================================================

export interface ProviderMeta {
  category: string
  provider: string
  providerName: string
  isAutoSelected?: boolean  // true if system picked the only connected provider
}

export type DraftingEvent =
  | { type: 'init'; prompt: string; providers: ProviderMeta[]; vagueTerms?: VagueTermInfo[] }
  | { type: 'provider_selected'; key: string; label: string; value: string }
  | { type: 'plan_generated'; planNodeCount: number; openItems?: OpenItem[] }
  | { type: 'plan_approved' }
  | { type: 'clarification_answered'; key: string; value: string }
  | { type: 'refinement'; prompt: string }
  | { type: 'override'; key: string; label: string; newValue: string }

export interface VagueTermInfo {
  term: string
  category: string
  label: string
}

// ============================================================================
// REDUCER
// ============================================================================

/**
 * Pure function that produces the next DraftingContext from the current state + an event.
 * All updates are deterministic — no LLM calls.
 */
export function updateDraftingContext(
  current: DraftingContext | null,
  event: DraftingEvent
): DraftingContext {
  const now = new Date().toISOString()

  switch (event.type) {
    case 'init': {
      const resolved: ResolvedDecision[] = event.providers.map(p => ({
        key: `${p.category}_provider`,
        label: `${capitalize(p.category)} provider`,
        value: p.provider,
        source: p.isAutoSelected ? 'inferred' as const : 'explicit' as const,
        resolvedAt: now,
      }))

      const openItems: OpenItem[] = (event.vagueTerms ?? []).map(vt => ({
        key: `${vt.category}_provider`,
        label: vt.label,
        reason: `User said "${vt.term}" but didn't specify a provider`,
        priority: 'blocking' as const,
      }))

      const hasBlocking = openItems.some(i => i.priority === 'blocking')
      const phase: DraftingPhase = hasBlocking ? 'gathering' : 'planning'
      const nextAction = hasBlocking
        ? `Ask: ${openItems.find(i => i.priority === 'blocking')!.label}`
        : 'Generate workflow plan'

      return {
        goal: event.prompt,
        resolved,
        openItems,
        nextAction,
        phase,
        turnCount: 1,
        updatedAt: now,
      }
    }

    case 'provider_selected': {
      if (!current) return createEmpty(now)

      // Move from openItems → resolved
      const openItems = current.openItems.filter(i => i.key !== event.key)
      const alreadyResolved = current.resolved.some(r => r.key === event.key)
      const resolved = alreadyResolved
        ? current.resolved.map(r =>
            r.key === event.key
              ? { ...r, value: event.value, source: 'explicit' as const, resolvedAt: now }
              : r
          )
        : [
            ...current.resolved,
            {
              key: event.key,
              label: event.label,
              value: event.value,
              source: 'explicit' as const,
              resolvedAt: now,
            },
          ]

      const hasBlocking = openItems.some(i => i.priority === 'blocking')
      const phase: DraftingPhase = hasBlocking ? 'gathering' : advancePhase(current.phase)
      const nextAction = hasBlocking
        ? `Ask: ${openItems.find(i => i.priority === 'blocking')!.label}`
        : 'Generate workflow plan'

      return {
        ...current,
        resolved,
        openItems,
        nextAction,
        phase,
        turnCount: current.turnCount + 1,
        updatedAt: now,
      }
    }

    case 'plan_generated': {
      if (!current) return createEmpty(now)

      const newOpenItems = event.openItems ?? []
      const mergedOpenItems = mergeOpenItems(current.openItems, newOpenItems)

      return {
        ...current,
        openItems: mergedOpenItems,
        nextAction: mergedOpenItems.some(i => i.priority === 'blocking')
          ? `Resolve: ${mergedOpenItems.find(i => i.priority === 'blocking')!.label}`
          : 'Review and approve plan',
        phase: 'refining',
        turnCount: current.turnCount + 1,
        updatedAt: now,
      }
    }

    case 'plan_approved': {
      if (!current) return createEmpty(now)

      return {
        ...current,
        nextAction: 'Build workflow',
        phase: 'ready',
        turnCount: current.turnCount + 1,
        updatedAt: now,
      }
    }

    case 'clarification_answered': {
      if (!current) return createEmpty(now)

      const openItems = current.openItems.filter(i => i.key !== event.key)
      const resolved = [
        ...current.resolved,
        {
          key: event.key,
          label: event.key.replace(/_/g, ' '),
          value: event.value,
          source: 'explicit' as const,
          resolvedAt: now,
        },
      ]

      const hasBlocking = openItems.some(i => i.priority === 'blocking')
      const phase: DraftingPhase = hasBlocking ? current.phase : advancePhase(current.phase)
      const nextAction = hasBlocking
        ? `Ask: ${openItems.find(i => i.priority === 'blocking')!.label}`
        : 'Generate workflow plan'

      return {
        ...current,
        resolved,
        openItems,
        nextAction,
        phase,
        turnCount: current.turnCount + 1,
        updatedAt: now,
      }
    }

    case 'refinement': {
      if (!current) return createEmpty(now)

      return {
        ...current,
        goal: `${current.goal} (refined: ${event.prompt})`,
        nextAction: 'Generate updated plan',
        phase: 'planning',
        turnCount: current.turnCount + 1,
        updatedAt: now,
      }
    }

    case 'override': {
      if (!current) return createEmpty(now)

      const resolved = current.resolved.map(r =>
        r.key === event.key
          ? { ...r, value: event.newValue, source: 'explicit' as const, resolvedAt: now }
          : r
      )

      return {
        ...current,
        resolved,
        nextAction: 'Regenerate plan with updated decision',
        phase: 'planning',
        turnCount: current.turnCount + 1,
        updatedAt: now,
      }
    }

    default:
      return current ?? createEmpty(now)
  }
}

// ============================================================================
// LLM FORMATTING
// ============================================================================

/**
 * Format DraftingContext as a compact text block for injection into LLM prompts.
 * Typically ~50-80 tokens.
 */
export function formatDraftingContextForLLM(ctx: DraftingContext): string {
  const lines: string[] = ['DRAFTING CONTEXT:']

  lines.push(`Goal: "${ctx.goal}"`)

  if (ctx.resolved.length > 0) {
    const decisions = ctx.resolved
      .map(r => `${r.key}=${r.value} [${r.source === 'explicit' ? 'confirmed' : 'inferred'}]`)
      .join(', ')
    lines.push(`Decided: ${decisions}`)
  }

  if (ctx.openItems.length > 0) {
    const items = ctx.openItems
      .map(i => `${i.label} (${i.priority})`)
      .join(', ')
    lines.push(`Still open: ${items}`)
  }

  lines.push(`Phase: ${ctx.phase} (turn ${ctx.turnCount})`)

  return lines.join('\n')
}

/**
 * The mandatory prompt rules appended when drafting context is present.
 */
export const DRAFTING_CONTEXT_RULES = `
DRAFTING CONTEXT RULES (mandatory when DRAFTING CONTEXT is provided):
1. Items marked [confirmed] are final — NEVER re-ask or revisit them.
2. Items marked [inferred] are system defaults — you MAY suggest alternatives if contextually relevant, but do not re-ask unprompted. Only override if the user's message implies a different choice.
3. Focus your response on items listed under "Still open" — prioritize blocking items first.
4. Align your plan with the stated Goal — do not drift or reinterpret unless the user explicitly changes it.
5. Respect the Phase and nextAction — if phase is "gathering", ask clarifying questions; if "planning", generate the workflow.
6. Do NOT change a [confirmed] decision unless the user EXPLICITLY says to override it (e.g., "actually use Outlook instead of Gmail").
7. If all blocking open items are unresolved, ask about them BEFORE generating a final workflow plan.
8. Prefer the drafting context over re-parsing raw chat history — it is the authoritative summary of conversation state.
`.trim()

// ============================================================================
// HELPERS
// ============================================================================

function createEmpty(now: string): DraftingContext {
  return {
    goal: '',
    resolved: [],
    openItems: [],
    nextAction: '',
    phase: 'gathering',
    turnCount: 0,
    updatedAt: now,
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Advance phase forward: gathering → planning → refining → ready.
 * Never goes backward unless an override or refinement event resets it.
 */
function advancePhase(current: DraftingPhase): DraftingPhase {
  switch (current) {
    case 'gathering': return 'planning'
    case 'planning': return 'planning' // stays until plan_generated
    case 'refining': return 'refining' // stays until plan_approved
    case 'ready': return 'ready'
  }
}

/**
 * Merge new open items into existing list, avoiding duplicates by key.
 */
function mergeOpenItems(existing: OpenItem[], incoming: OpenItem[]): OpenItem[] {
  const keys = new Set(existing.map(i => i.key))
  const merged = [...existing]
  for (const item of incoming) {
    if (!keys.has(item.key)) {
      merged.push(item)
      keys.add(item.key)
    }
  }
  return merged
}
