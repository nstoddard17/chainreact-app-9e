/**
 * Wrapper around updateDraftingContext that emits agent eval events.
 * Does NOT modify the pure reducer — just observes the event and emits telemetry.
 */

import {
  updateDraftingContext,
  type DraftingContext,
  type DraftingEvent,
} from '@/src/lib/workflows/builder/agent/draftingContext'
import { agentEvalTracker } from './agentEvalTracker'
import { AGENT_EVAL_EVENTS } from './agentEvalTypes'

export function trackableDraftingUpdate(
  current: DraftingContext | null,
  event: DraftingEvent
): DraftingContext | null {
  // Emit eval events based on drafting event type
  switch (event.type) {
    case 'init':
      if (event.vagueTerms?.length) {
        for (const term of event.vagueTerms) {
          agentEvalTracker.trackEvent(AGENT_EVAL_EVENTS.DRAFTING_OPEN_ITEM_ADDED, {
            key: term.term,
            priority: 'blocking',
          })
        }
      }
      break

    case 'provider_selected':
      agentEvalTracker.trackEvent(AGENT_EVAL_EVENTS.DRAFTING_ITEM_RESOLVED, {
        key: event.key,
        source: 'explicit',
      })
      break

    case 'clarification_answered':
      agentEvalTracker.trackEvent(AGENT_EVAL_EVENTS.DRAFTING_ITEM_RESOLVED, {
        key: event.key,
        source: 'explicit',
      })
      agentEvalTracker.trackEvent(AGENT_EVAL_EVENTS.CLARIFICATION_ANSWERED, {
        clarification_type: 'goal',
      })
      break

    case 'override':
      agentEvalTracker.trackEvent(AGENT_EVAL_EVENTS.DRAFTING_OVERRIDE, {
        key: event.key,
      })
      break

    case 'plan_generated':
      if (event.openItems?.length) {
        for (const item of event.openItems) {
          agentEvalTracker.trackEvent(AGENT_EVAL_EVENTS.DRAFTING_OPEN_ITEM_ADDED, {
            key: item.key,
            priority: item.priority,
          })
        }
      }
      break
  }

  // Delegate to the pure reducer
  return updateDraftingContext(current, event)
}
