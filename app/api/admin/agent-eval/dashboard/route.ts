import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { AGENT_VERSION, type FunnelStep, type KPIData, type ContextGroupMetrics, type ContextType } from '@/lib/eval/agentEvalTypes'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // Admin check
    const supabaseAdmin = await createSupabaseServiceClient()
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('admin')
      .eq('id', user.id)
      .single()

    if (!profile?.admin) {
      return errorResponse('Admin access required', 403)
    }

    const url = new URL(request.url)

    // Session detail mode: return all events for a specific conversation
    const conversationId = url.searchParams.get('conversation_id')
    if (conversationId) {
      const { data: events, error } = await supabaseAdmin
        .from('agent_eval_events' as any)
        .select('event_name, category, metadata, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200)

      if (error) {
        return errorResponse('Failed to fetch session events', 500)
      }

      const sessionEvents = (events || []).map((e: any) => {
        const meta = e.metadata || {}
        let detail = ''
        if (e.event_name === 'agent.plan_generated') detail = `${meta.node_count} nodes, confidence: ${meta.confidence || '—'}`
        else if (e.event_name === 'agent.build_completed') detail = `${meta.nodes_configured}/${meta.node_count} configured`
        else if (e.event_name === 'agent.node_test_result') detail = `${meta.node_type} ${meta.passed ? 'passed' : 'failed'}`
        else if (e.event_name === 'agent.manual_correction') detail = `${meta.correction_type} (${meta.severity})`
        else if (e.event_name === 'agent.state_transition') detail = `${meta.from_state} → ${meta.to_state}`
        else if (e.event_name === 'agent.prompt_submitted') detail = `turn ${meta.turn_number}`
        else if (e.event_name === 'agent.plan_approved') detail = meta.was_first_plan ? 'first plan' : 'revised plan'
        else if (e.event_name === 'agent.activation_succeeded') detail = ''
        else if (e.event_name === 'agent.activation_blocked') detail = (meta.reasons || []).join(', ')

        return {
          timestamp: e.created_at,
          event_name: e.event_name,
          category: e.category,
          detail,
          metadata: meta,
        }
      })

      return successResponse({ events: sessionEvents })
    }

    const days = parseInt(url.searchParams.get('days') || '30', 10)
    const plannerPathFilter = url.searchParams.get('planner_path') || null
    const promptTypeFilter = url.searchParams.get('prompt_type') || null
    const versionFilter = url.searchParams.get('agent_version') || null

    const now = new Date()
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const prevPeriodStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000)

    // Build base query filter
    const buildFilter = (query: any) => {
      let q = query.gte('created_at', periodStart.toISOString())
      if (plannerPathFilter) q = q.eq('planner_path', plannerPathFilter)
      if (promptTypeFilter) q = q.eq('prompt_type', promptTypeFilter)
      if (versionFilter) q = q.eq('agent_version', versionFilter)
      return q
    }

    const buildPrevFilter = (query: any) => {
      let q = query
        .gte('created_at', prevPeriodStart.toISOString())
        .lt('created_at', periodStart.toISOString())
      if (plannerPathFilter) q = q.eq('planner_path', plannerPathFilter)
      if (promptTypeFilter) q = q.eq('prompt_type', promptTypeFilter)
      if (versionFilter) q = q.eq('agent_version', versionFilter)
      return q
    }

    // Fetch current and previous period events in parallel
    const [currentResult, prevResult] = await Promise.all([
      buildFilter(
        supabaseAdmin
          .from('agent_eval_events' as any)
          .select('event_name, category, conversation_id, session_outcome, metadata, created_at, planner_path, prompt_type, agent_version, turn_number')
      ) as Promise<{ data: EventRow[] | null; error: any }>,
      buildPrevFilter(
        supabaseAdmin
          .from('agent_eval_events' as any)
          .select('event_name, conversation_id, session_outcome, metadata')
      ) as Promise<{ data: EventRow[] | null; error: any }>,
    ])

    if (currentResult.error) {
      logger.error('[AgentEval] Dashboard query failed', { error: currentResult.error.message })
      return errorResponse('Failed to fetch data', 500)
    }

    const events = currentResult.data || []
    const prevEvents = prevResult.data || []

    // ─── Compute Funnel ───────────────────────────────────
    const funnelData = computeFunnel(events, prevEvents)

    // ─── Compute Quality ──────────────────────────────────
    const qualityData = computeQuality(events, prevEvents)

    // ─── Compute Context ──────────────────────────────────
    const contextData = computeContext(events)

    // ─── Compute Trust ────────────────────────────────────
    const trustData = computeTrust(events, prevEvents)

    // ─── Sampled Sessions ─────────────────────────────────
    const sampledSessions = computeSampledSessions(events)

    const dashboard = {
      funnel: funnelData,
      quality: qualityData,
      context: contextData,
      trust: trustData,
      sampled_sessions: sampledSessions,
      period: {
        days,
        start: periodStart.toISOString(),
        end: now.toISOString(),
      },
      agent_version: AGENT_VERSION,
    }

    return successResponse(dashboard)
  } catch (error: any) {
    logger.error('[AgentEval] Dashboard route error', { error: error.message })
    return errorResponse('Internal server error', 500)
  }
}

// ─── Helper Types ───────────────────────────────────────────
type EventRow = {
  event_name: string
  category?: string
  conversation_id: string
  session_outcome?: string | null
  metadata: Record<string, any>
  created_at?: string
  planner_path?: string | null
  prompt_type?: string | null
  agent_version?: string
  turn_number?: number
}

// ─── Funnel Computation ─────────────────────────────────────

function countByEvent(events: EventRow[], eventName: string): number {
  return new Set(
    events.filter(e => e.event_name === eventName).map(e => e.conversation_id)
  ).size
}

function makeKPI(current: number, previous: number, higherIsGood: boolean, format: 'pct' | 'number' | 'time' = 'number'): KPIData {
  const delta = previous > 0 ? current - previous : 0
  const trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

  const formatVal = (v: number) => {
    if (format === 'pct') return `${(v * 100).toFixed(1)}%`
    if (format === 'time') {
      const secs = Math.round(v / 1000)
      const mins = Math.floor(secs / 60)
      const rem = secs % 60
      return mins > 0 ? `${mins}m ${rem}s` : `${rem}s`
    }
    return v.toFixed(1)
  }

  return {
    value: formatVal(current),
    previous_value: formatVal(previous),
    delta: parseFloat(delta.toFixed(2)),
    trend,
    is_good: higherIsGood ? trend === 'up' : trend === 'down',
  }
}

function computeFunnel(events: EventRow[], prevEvents: EventRow[]) {
  const stages = [
    { stage: 'Prompts', event: 'agent.prompt_submitted' },
    { stage: 'Plans', event: 'agent.plan_generated' },
    { stage: 'Approved', event: 'agent.plan_approved' },
    { stage: 'Builds', event: 'agent.build_started' },
    { stage: 'Completed', event: 'agent.build_completed' },
    { stage: 'Activated', event: 'agent.activation_succeeded' },
  ]

  const funnel: FunnelStep[] = stages.map((s, i) => {
    const count = countByEvent(events, s.event)
    const prevCount = i > 0 ? countByEvent(events, stages[i - 1].event) : count
    return {
      stage: s.stage,
      count,
      conversion_pct: prevCount > 0 ? (count / prevCount) * 100 : 0,
    }
  })

  // Find biggest drop-off
  let biggestDrop: { from: string; to: string; pct_lost: number } | null = null
  let maxLoss = 0
  for (let i = 1; i < funnel.length; i++) {
    const loss = 100 - funnel[i].conversion_pct
    if (loss > maxLoss && funnel[i - 1].count > 0) {
      maxLoss = loss
      biggestDrop = {
        from: funnel[i - 1].stage,
        to: funnel[i].stage,
        pct_lost: parseFloat(loss.toFixed(1)),
      }
    }
  }

  // Daily activations
  const activationEvents = events.filter(e => e.event_name === 'agent.activation_succeeded')
  const dailyMap = new Map<string, number>()
  for (const e of activationEvents) {
    const day = (e.created_at || '').substring(0, 10)
    if (day) dailyMap.set(day, (dailyMap.get(day) || 0) + 1)
  }
  const daily_activations = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // KPIs
  const prompts = countByEvent(events, 'agent.prompt_submitted')
  const prevPrompts = countByEvent(prevEvents, 'agent.prompt_submitted')
  const activated = countByEvent(events, 'agent.activation_succeeded')
  const prevActivated = countByEvent(prevEvents, 'agent.activation_succeeded')

  const plansGenerated = countByEvent(events, 'agent.plan_generated')
  const prevPlansGenerated = countByEvent(prevEvents, 'agent.plan_generated')

  // First plan acceptance
  const firstPlanApprovals = events.filter(
    e => e.event_name === 'agent.plan_approved' && e.metadata?.was_first_plan === true
  )
  const firstPlanRate = plansGenerated > 0
    ? new Set(firstPlanApprovals.map(e => e.conversation_id)).size / plansGenerated
    : 0
  const prevFirstPlanApprovals = prevEvents.filter(
    e => e.event_name === 'agent.plan_approved' && e.metadata?.was_first_plan === true
  )
  const prevFirstPlanRate = prevPlansGenerated > 0
    ? new Set(prevFirstPlanApprovals.map(e => e.conversation_id)).size / prevPlansGenerated
    : 0

  // Turns to success
  const turnsEvents = events.filter(
    e => e.event_name === 'agent.activation_succeeded' && e.metadata?.turns_to_success != null
  )
  const turnsValues = turnsEvents.map(e => e.metadata.turns_to_success as number).sort((a, b) => a - b)
  const medianTurns = turnsValues.length > 0
    ? turnsValues[Math.floor(turnsValues.length / 2)]
    : 0

  const prevTurnsEvents = prevEvents.filter(
    e => e.event_name === 'agent.activation_succeeded' && e.metadata?.turns_to_success != null
  )
  const prevTurnsValues = prevTurnsEvents.map(e => e.metadata.turns_to_success as number).sort((a, b) => a - b)
  const prevMedianTurns = prevTurnsValues.length > 0
    ? prevTurnsValues[Math.floor(prevTurnsValues.length / 2)]
    : 0

  // Build completion
  const builds = countByEvent(events, 'agent.build_started')
  const prevBuilds = countByEvent(prevEvents, 'agent.build_started')
  const completed = countByEvent(events, 'agent.build_completed')
  const prevCompleted = countByEvent(prevEvents, 'agent.build_completed')
  const buildRate = builds > 0 ? completed / builds : 0
  const prevBuildRate = prevBuilds > 0 ? prevCompleted / prevBuilds : 0

  // Invalid variable rate
  const conversations = new Set(events.map(e => e.conversation_id)).size
  const prevConversations = new Set(prevEvents.map(e => e.conversation_id)).size
  const invalidVarConvos = new Set(
    events.filter(e => e.event_name === 'agent.invalid_variable_ref').map(e => e.conversation_id)
  ).size
  const prevInvalidVarConvos = new Set(
    prevEvents.filter(e => e.event_name === 'agent.invalid_variable_ref').map(e => e.conversation_id)
  ).size
  const invalidRate = conversations > 0 ? invalidVarConvos / conversations : 0
  const prevInvalidRate = prevConversations > 0 ? prevInvalidVarConvos / prevConversations : 0

  // Top failure label
  const failureLabels: Record<string, number> = {}
  for (const e of events) {
    const labels = e.metadata?.failure_labels as string[] | undefined
    if (labels) {
      for (const l of labels) failureLabels[l] = (failureLabels[l] || 0) + 1
    }
  }
  const topFailure = Object.entries(failureLabels).sort((a, b) => b[1] - a[1])[0]
  const totalFailures = Object.values(failureLabels).reduce((s, v) => s + v, 0)

  return {
    kpis: {
      activation_rate: makeKPI(
        prompts > 0 ? activated / prompts : 0,
        prevPrompts > 0 ? prevActivated / prevPrompts : 0,
        true, 'pct'
      ),
      first_plan_accept: makeKPI(firstPlanRate, prevFirstPlanRate, true, 'pct'),
      turns_to_success: makeKPI(medianTurns, prevMedianTurns, false),
      build_completion: makeKPI(buildRate, prevBuildRate, true, 'pct'),
      invalid_variable_rate: makeKPI(invalidRate, prevInvalidRate, false, 'pct'),
      top_failure: {
        value: topFailure ? `${topFailure[0].replace('_failure', '')} ${totalFailures > 0 ? Math.round((topFailure[1] / totalFailures) * 100) : 0}%` : 'none',
        previous_value: '—',
        delta: 0,
        trend: 'flat',
        is_good: !topFailure,
      },
    },
    funnel,
    daily_activations,
    biggest_dropoff: biggestDrop,
  }
}

// ─── Quality Computation ────────────────────────────────────

function computeQuality(events: EventRow[], prevEvents: EventRow[]) {
  const conversations = new Set(events.map(e => e.conversation_id)).size
  const prevConversations = new Set(prevEvents.map(e => e.conversation_id)).size

  const plansGenerated = countByEvent(events, 'agent.plan_generated')
  const prevPlansGenerated = countByEvent(prevEvents, 'agent.plan_generated')

  const firstPlanAccepts = new Set(
    events.filter(e => e.event_name === 'agent.plan_approved' && e.metadata?.was_first_plan)
      .map(e => e.conversation_id)
  ).size
  const prevFirstPlanAccepts = new Set(
    prevEvents.filter(e => e.event_name === 'agent.plan_approved' && e.metadata?.was_first_plan)
      .map(e => e.conversation_id)
  ).size

  const clarificationConvos = new Set(
    events.filter(e => e.event_name === 'agent.clarification_asked').map(e => e.conversation_id)
  ).size
  const prevClarificationConvos = new Set(
    prevEvents.filter(e => e.event_name === 'agent.clarification_asked').map(e => e.conversation_id)
  ).size

  const correctionConvos = new Set(
    events.filter(e => e.event_name === 'agent.manual_correction').map(e => e.conversation_id)
  ).size
  const prevCorrectionConvos = new Set(
    prevEvents.filter(e => e.event_name === 'agent.manual_correction').map(e => e.conversation_id)
  ).size

  const duplicateConvos = new Set(
    events.filter(e => e.event_name === 'agent.duplicate_node').map(e => e.conversation_id)
  ).size
  const prevDuplicateConvos = new Set(
    prevEvents.filter(e => e.event_name === 'agent.duplicate_node').map(e => e.conversation_id)
  ).size

  const hallucinationCount = events.filter(e => e.event_name === 'agent.hallucinated_field').length
  const prevHallucinationCount = prevEvents.filter(e => e.event_name === 'agent.hallucinated_field').length

  // Severity breakdown
  const corrections = events.filter(e => e.event_name === 'agent.manual_correction')
  const severityCounts = { minor: 0, moderate: 0, major: 0 }
  for (const c of corrections) {
    const sev = (c.metadata?.severity as string) || 'minor'
    if (sev in severityCounts) severityCounts[sev as keyof typeof severityCounts]++
  }

  // Failure label breakdown
  const failureLabels: Record<string, number> = {}
  for (const e of events) {
    const labels = e.metadata?.failure_labels as string[] | undefined
    if (labels) for (const l of labels) failureLabels[l] = (failureLabels[l] || 0) + 1
  }

  // Weekly trends
  const weeklyMap = new Map<string, { accept: number; total: number; corrections: number; convos: number; version: string }>()
  for (const e of events) {
    const week = getWeekKey(e.created_at || '')
    if (!weeklyMap.has(week)) weeklyMap.set(week, { accept: 0, total: 0, corrections: 0, convos: 0, version: e.agent_version || AGENT_VERSION })
    const w = weeklyMap.get(week)!
    if (e.event_name === 'agent.plan_generated') w.total++
    if (e.event_name === 'agent.plan_approved' && e.metadata?.was_first_plan) w.accept++
    if (e.event_name === 'agent.manual_correction') w.corrections++
    w.convos = Math.max(w.convos, new Set(events.filter(ev => getWeekKey(ev.created_at || '') === week).map(ev => ev.conversation_id)).size)
  }

  const weekly_trends = Array.from(weeklyMap.entries())
    .map(([week, w]) => ({
      week,
      first_plan_accept: w.total > 0 ? w.accept / w.total : 0,
      correction_rate: w.convos > 0 ? w.corrections / w.convos : 0,
      agent_version: w.version,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))

  // Recent issues
  const qualityEvents = events.filter(e =>
    ['agent.manual_correction', 'agent.invalid_variable_ref', 'agent.hallucinated_field', 'agent.duplicate_node'].includes(e.event_name)
  )
  const recent_issues = qualityEvents
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 10)
    .map(e => ({
      date: e.created_at || '',
      conversation_id: e.conversation_id,
      event_type: e.event_name.replace('agent.', ''),
      failure_label: ((e.metadata?.failure_labels as string[]) || [])[0] || null,
      severity: (e.metadata?.severity as string) || null,
      node_type: (e.metadata?.node_type as string) || null,
    }))

  return {
    mini_kpis: {
      first_plan_accept_pct: makeKPI(
        plansGenerated > 0 ? firstPlanAccepts / plansGenerated : 0,
        prevPlansGenerated > 0 ? prevFirstPlanAccepts / prevPlansGenerated : 0,
        true, 'pct'
      ),
      clarification_rate: makeKPI(
        conversations > 0 ? clarificationConvos / conversations : 0,
        prevConversations > 0 ? prevClarificationConvos / prevConversations : 0,
        false, 'pct'
      ),
      manual_correction_rate: makeKPI(
        conversations > 0 ? correctionConvos / conversations : 0,
        prevConversations > 0 ? prevCorrectionConvos / prevConversations : 0,
        false, 'pct'
      ),
      severity_breakdown: severityCounts,
      duplicate_node_rate: makeKPI(
        conversations > 0 ? duplicateConvos / conversations : 0,
        prevConversations > 0 ? prevDuplicateConvos / prevConversations : 0,
        false, 'pct'
      ),
      hallucinated_field_count: makeKPI(hallucinationCount, prevHallucinationCount, false),
    },
    weekly_trends,
    failure_label_breakdown: failureLabels as any,
    recent_issues,
  }
}

// ─── Context Computation ────────────────────────────────────

function computeContext(events: EventRow[]) {
  const contextTypes: ContextType[] = ['none', 'manual', 'auto', 'auto+drafting']
  const groups: ContextGroupMetrics[] = []

  for (const ct of contextTypes) {
    const prompts = events.filter(
      e => e.event_name === 'agent.prompt_submitted' && e.metadata?.context_type === ct
    )
    const convoIds = new Set(prompts.map(e => e.conversation_id))
    const sessionCount = convoIds.size

    if (sessionCount === 0) {
      groups.push({
        context_type: ct,
        session_count: 0,
        plan_approval_pct: 0,
        build_completion_pct: 0,
        activation_pct: 0,
        avg_follow_up_turns: 0,
        effectiveness_score: 0,
      })
      continue
    }

    const approved = new Set(
      events.filter(e => e.event_name === 'agent.plan_approved' && convoIds.has(e.conversation_id))
        .map(e => e.conversation_id)
    ).size

    const completed = new Set(
      events.filter(e => e.event_name === 'agent.build_completed' && convoIds.has(e.conversation_id))
        .map(e => e.conversation_id)
    ).size

    const activated = new Set(
      events.filter(e => e.event_name === 'agent.activation_succeeded' && convoIds.has(e.conversation_id))
        .map(e => e.conversation_id)
    ).size

    // Avg follow-up turns per conversation
    const turnsByConvo = new Map<string, number>()
    for (const e of events) {
      if (convoIds.has(e.conversation_id)) {
        const current = turnsByConvo.get(e.conversation_id) || 0
        turnsByConvo.set(e.conversation_id, Math.max(current, e.turn_number || 0))
      }
    }
    const avgTurns = turnsByConvo.size > 0
      ? Array.from(turnsByConvo.values()).reduce((s, v) => s + v, 0) / turnsByConvo.size
      : 0

    const approvalPct = approved / sessionCount
    const completionPct = completed / sessionCount
    const activationPct = activated / sessionCount

    // Invalid var rate for this context group
    const invalidVarConvos = new Set(
      events.filter(e => e.event_name === 'agent.invalid_variable_ref' && convoIds.has(e.conversation_id))
        .map(e => e.conversation_id)
    ).size
    const invalidRate = invalidVarConvos / sessionCount

    // Correction rate
    const correctionConvos = new Set(
      events.filter(e => e.event_name === 'agent.manual_correction' && convoIds.has(e.conversation_id))
        .map(e => e.conversation_id)
    ).size
    const correctionRate = correctionConvos / sessionCount

    // Effectiveness score: 0-100
    const maxTurns = 20
    const turnsNormalized = Math.min(avgTurns / maxTurns, 1)
    const score = Math.round(
      (0.4 * activationPct +
       0.3 * (1 - correctionRate) +
       0.2 * (1 - turnsNormalized) +
       0.1 * (1 - invalidRate)) * 100
    )

    groups.push({
      context_type: ct,
      session_count: sessionCount,
      plan_approval_pct: parseFloat((approvalPct * 100).toFixed(1)),
      build_completion_pct: parseFloat((completionPct * 100).toFixed(1)),
      activation_pct: parseFloat((activationPct * 100).toFixed(1)),
      avg_follow_up_turns: parseFloat(avgTurns.toFixed(1)),
      effectiveness_score: score,
    })
  }

  // Determine best group
  const nonEmpty = groups.filter(g => g.session_count > 0)
  const best = nonEmpty.sort((a, b) => b.effectiveness_score - a.effectiveness_score)[0]
  const worst = nonEmpty.sort((a, b) => a.effectiveness_score - b.effectiveness_score)[0]

  let summary = 'No data yet'
  if (best && worst && best.context_type !== worst.context_type) {
    const lift = worst.activation_pct > 0
      ? (best.activation_pct / worst.activation_pct).toFixed(1)
      : '∞'
    summary = `Best: ${best.context_type} (score: ${best.effectiveness_score}) — ${lift}x activation vs ${worst.context_type}`
  }

  return {
    groups,
    best_group: best?.context_type || null,
    summary,
  }
}

// ─── Trust Computation ──────────────────────────────────────

function computeTrust(events: EventRow[], prevEvents: EventRow[]) {
  const testEvents = events.filter(e => e.event_name === 'agent.node_test_result')
  const passed = testEvents.filter(e => e.metadata?.passed === true).length
  const testTotal = testEvents.length
  const testRate = testTotal > 0 ? passed / testTotal : 0

  const prevTestEvents = prevEvents.filter(e => e.event_name === 'agent.node_test_result')
  const prevPassed = prevTestEvents.filter(e => e.metadata?.passed === true).length
  const prevTestRate = prevTestEvents.length > 0 ? prevPassed / prevTestEvents.length : 0

  const blocked = events.filter(e => e.event_name === 'agent.activation_blocked')
  const prevBlocked = prevEvents.filter(e => e.event_name === 'agent.activation_blocked')

  const providerBlockers = events.filter(e => e.event_name === 'agent.provider_connect_blocker').length
  const prevProviderBlockers = prevEvents.filter(e => e.event_name === 'agent.provider_connect_blocker').length

  // Resolution times
  const unblockedEvents = events.filter(e => e.event_name === 'agent.activation_unblocked')
  const resolutionTimes = unblockedEvents
    .map(e => e.metadata?.time_to_resolution_ms as number)
    .filter(t => t != null && t > 0)
    .sort((a, b) => a - b)
  const medianResolution = resolutionTimes.length > 0
    ? resolutionTimes[Math.floor(resolutionTimes.length / 2)]
    : 0

  // Blocked reasons breakdown
  const reasonCounts: Record<string, number> = {}
  for (const e of blocked) {
    const reasons = (e.metadata?.reasons as string[]) || ['unknown']
    for (const r of reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1
  }
  const totalReasons = Object.values(reasonCounts).reduce((s, v) => s + v, 0)
  const blocked_reasons = Object.entries(reasonCounts)
    .map(([reason, count]) => ({
      reason,
      count,
      pct: totalReasons > 0 ? parseFloat(((count / totalReasons) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // Weekly trends
  const weeklyMap = new Map<string, { passed: number; total: number; activated: number; attempted: number }>()
  for (const e of events) {
    const week = getWeekKey(e.created_at || '')
    if (!weeklyMap.has(week)) weeklyMap.set(week, { passed: 0, total: 0, activated: 0, attempted: 0 })
    const w = weeklyMap.get(week)!
    if (e.event_name === 'agent.node_test_result') {
      w.total++
      if (e.metadata?.passed) w.passed++
    }
    if (e.event_name === 'agent.activation_succeeded') w.activated++
    if (e.event_name === 'agent.activation_attempted') w.attempted++
  }

  const weekly_trends = Array.from(weeklyMap.entries())
    .map(([week, w]) => ({
      week,
      test_pass_rate: w.total > 0 ? w.passed / w.total : 0,
      activation_success_rate: w.attempted > 0 ? w.activated / w.attempted : 0,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))

  return {
    node_test_pass_rate: makeKPI(testRate, prevTestRate, true, 'pct'),
    activation_blocked_count: makeKPI(blocked.length, prevBlocked.length, false),
    median_resolution_time_ms: makeKPI(medianResolution, 0, false, 'time'),
    provider_blockers: makeKPI(providerBlockers, prevProviderBlockers, false),
    blocked_reasons,
    weekly_trends,
  }
}

// ─── Sampled Sessions ───────────────────────────────────────

function computeSampledSessions(events: EventRow[]) {
  // Group events by conversation
  const convoMap = new Map<string, EventRow[]>()
  for (const e of events) {
    if (!convoMap.has(e.conversation_id)) convoMap.set(e.conversation_id, [])
    convoMap.get(e.conversation_id)!.push(e)
  }

  // Filter to sampled conversations (check metadata flag or use hash)
  const sampled: any[] = []
  for (const [convoId, convoEvents] of convoMap) {
    // Deterministic sampling: last hex char < 2
    const lastChar = convoId.charAt(convoId.length - 1)
    if (parseInt(lastChar, 16) >= 2) continue

    const promptEvent = convoEvents.find(e => e.event_name === 'agent.prompt_submitted')
    const buildComplete = convoEvents.find(e => e.event_name === 'agent.build_completed')
    const activationSucceeded = convoEvents.find(e => e.event_name === 'agent.activation_succeeded')
    const activationBlocked = convoEvents.find(e => e.event_name === 'agent.activation_blocked')

    const qualityEvents = convoEvents.filter(e =>
      ['agent.manual_correction', 'agent.invalid_variable_ref', 'agent.hallucinated_field', 'agent.duplicate_node'].includes(e.event_name)
    )
    const corrections = convoEvents.filter(e => e.event_name === 'agent.manual_correction')
    const severities = corrections.map(c => c.metadata?.severity as string).filter(Boolean)
    const maxSeverity = severities.includes('major') ? 'major' : severities.includes('moderate') ? 'moderate' : severities.length > 0 ? 'minor' : null

    let outcome: string = 'abandoned'
    if (activationSucceeded) outcome = 'activated'
    else if (activationBlocked) outcome = 'blocked'

    sampled.push({
      conversation_id: convoId,
      date: promptEvent?.created_at || convoEvents[0]?.created_at || '',
      prompt_preview: (promptEvent?.metadata?.prompt_text as string)?.substring(0, 100) || null,
      node_count: (buildComplete?.metadata?.node_count as number) || 0,
      context_type: (promptEvent?.metadata?.context_type as string) || 'none',
      quality_event_count: qualityEvents.length,
      correction_count: corrections.length,
      max_severity: maxSeverity,
      outcome,
      agent_version: convoEvents[0]?.agent_version || AGENT_VERSION,
      planner_path: convoEvents[0]?.planner_path || null,
      turns_to_success: (activationSucceeded?.metadata?.turns_to_success as number) || null,
    })
  }

  return sampled
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
}

// ─── Utilities ──────────────────────────────────────────────

function getWeekKey(isoDate: string): string {
  if (!isoDate) return 'unknown'
  const d = new Date(isoDate)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
  return monday.toISOString().substring(0, 10)
}
