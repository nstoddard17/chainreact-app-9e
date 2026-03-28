/**
 * Agent Evaluation Tracker - Client-Side Singleton
 *
 * Fire-and-forget telemetry for the agent evaluation framework.
 * NOT a Zustand store — never triggers re-renders.
 *
 * Usage:
 *   import { agentEvalTracker } from '@/lib/eval/agentEvalTracker'
 *   agentEvalTracker.init(userId)
 *   agentEvalTracker.startConversation()
 *   agentEvalTracker.trackEvent(AGENT_EVAL_EVENTS.PROMPT_SUBMITTED, { prompt_length: 42 })
 */

import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import {
  type AgentEvalEvent,
  type AgentEvalEventName,
  type PlannerPath,
  type PromptType,
  type SessionOutcome,
  AGENT_VERSION,
  getEventCategory,
} from './agentEvalTypes'

const FLUSH_INTERVAL_MS = 5000
const BATCH_ENDPOINT = '/api/admin/agent-eval/events'

function generateUUID(): string {
  return crypto.randomUUID()
}

class AgentEvalTracker {
  private userId: string | null = null
  private sessionId: string | null = null
  private conversationId: string | null = null
  private buffer: AgentEvalEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private lastEventTime: number | null = null
  private turnCounter = 0
  private isFlushing = false

  // Carried-forward fields set during planning
  private plannerPath: PlannerPath | null = null
  private llmModel: string | null = null
  private promptType: PromptType | null = null
  private sessionOutcome: SessionOutcome | null = null
  private flowId: string | null = null

  /**
   * Initialize the tracker. Call once when the builder mounts.
   */
  init(userId: string): void {
    this.userId = userId
    this.sessionId = generateUUID()
    this.buffer = []
    this.turnCounter = 0
    this.lastEventTime = null
    this.plannerPath = null
    this.llmModel = null
    this.promptType = null
    this.sessionOutcome = null
    this.flowId = null

    // Start periodic flush
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush())
    }
  }

  /**
   * Start a new conversation (new prompt thread).
   * Refinements within the same thread should NOT call this.
   */
  startConversation(): void {
    this.conversationId = generateUUID()
    this.turnCounter = 0
    this.lastEventTime = null
    this.plannerPath = null
    this.llmModel = null
    this.promptType = null
    this.sessionOutcome = null
  }

  getConversationId(): string | null {
    return this.conversationId
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  /**
   * Set carried-forward fields (call after plan_generated).
   */
  setPlannerInfo(plannerPath: PlannerPath, llmModel: string | null): void {
    this.plannerPath = plannerPath
    this.llmModel = llmModel
  }

  setPromptType(promptType: PromptType): void {
    this.promptType = promptType
  }

  setFlowId(flowId: string): void {
    this.flowId = flowId
  }

  setSessionOutcome(outcome: SessionOutcome): void {
    this.sessionOutcome = outcome
  }

  /**
   * Track an evaluation event. Auto-attaches all global fields.
   */
  trackEvent(eventName: AgentEvalEventName, metadata: Record<string, unknown> = {}): void {
    if (!this.userId || !this.sessionId || !this.conversationId) return

    const now = performance.now()
    const timeSinceLastTurn = this.lastEventTime !== null
      ? Math.round(now - this.lastEventTime)
      : null
    this.lastEventTime = now
    this.turnCounter++

    const event: AgentEvalEvent = {
      event_name: eventName,
      category: getEventCategory(eventName),
      session_id: this.sessionId,
      conversation_id: this.conversationId,
      flow_id: this.flowId,
      agent_version: AGENT_VERSION,
      session_outcome: this.sessionOutcome,
      planner_path: this.plannerPath,
      llm_model: this.llmModel,
      turn_number: this.turnCounter,
      prompt_type: this.promptType,
      time_since_last_turn_ms: timeSinceLastTurn,
      metadata,
    }

    this.buffer.push(event)
  }

  /**
   * Check if this conversation is sampled (10% deterministic).
   */
  isSampled(): boolean {
    if (!this.conversationId) return false
    // Use last hex char of UUID for deterministic sampling
    const lastChar = this.conversationId.charAt(this.conversationId.length - 1)
    return parseInt(lastChar, 16) < 2 // ~12.5% but close enough to 10%
  }

  /**
   * Flush buffered events to the server.
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.isFlushing) return

    const events = [...this.buffer]
    this.buffer = []
    this.isFlushing = true

    try {
      await fetchWithTimeout(BATCH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      }, 10000)
    } catch {
      // Re-add events to buffer on failure (best-effort)
      this.buffer.unshift(...events)
    } finally {
      this.isFlushing = false
    }
  }

  /**
   * Clean up timers. Call when builder unmounts.
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    // Final flush
    this.flush()
  }
}

// Singleton instance
export const agentEvalTracker = new AgentEvalTracker()
