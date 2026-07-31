import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Provider-neutral live-trigger capture contract (WORKFLOW-LIVE-TEST-3 §6).
 *
 * A capture adapter is the TEMPORARY, session-scoped stand-in for a provider's production
 * trigger: it watches for ONE real matching event on behalf of a live-test session, using the
 * account's real connection and the node's configured filters — and nothing else. The hard rules
 * every implementation inherits from this contract:
 *
 *   - NEVER mutate production trigger state: no `trigger_resources` row, no
 *     `snapshot.historyId` advance, no `webhook_event_dedup` insert or consume, no permanent
 *     subscription. The baseline lives on the SESSION, nowhere else.
 *   - Return the CANONICAL production payload (`TriggerEvent` — the exact shape the activated
 *     trigger would emit), so downstream execution is indistinguishable from a real dispatch.
 *   - Capture is NOT authorization. An adapter reports what it saw; whether that event may
 *     execute is decided solely by the live-test authorization service + the database claim.
 *   - Cancellation/expiration are checked by the ORCHESTRATOR around every poll — an adapter
 *     performs one bounded inspection per call and never loops on its own, so a cancelled or
 *     expired session simply stops being polled and a delayed result dies at the guarded
 *     `recordCapturedTrigger` transition.
 */

export interface LiveCaptureContext {
  readonly accountId: string;
  readonly workflowId: string;
  readonly sessionId: string;
  /** The trigger node's saved config (filters). Server-loaded — never client-posted. */
  readonly triggerConfig: Readonly<Record<string, unknown>>;
}

/**
 * Serializable listening baseline, persisted to `workflow_live_test_sessions.capture_baseline`.
 * Provider-specific inside, opaque out here. MUST let the adapter exclude events that were
 * already eligible before listening started.
 */
export type TriggerBaseline = Readonly<Record<string, unknown>>;

/** SAFE, owner-visible summary of the captured event — the only capture data a client sees. */
export interface SafeTriggerPreview {
  readonly [key: string]: string | null;
}

export type CaptureAttemptResult =
  | { readonly status: "waiting" }
  | {
      readonly status: "captured";
      readonly payload: TriggerEvent;
      readonly preview: SafeTriggerPreview;
      /** Baseline advanced past the captured event — persisted so a retry cannot re-capture it. */
      readonly baseline: TriggerBaseline;
    };

export interface LiveTriggerCaptureAdapter {
  readonly providerId: string;
  readonly eventType: string;

  /**
   * Establish the point-in-time baseline when listening STARTS. Events already eligible before
   * this moment must never be captured as newly received. Throws → the start service leaves the
   * session in awaiting_consent and returns a typed retryable failure.
   */
  establishBaseline(context: LiveCaptureContext): Promise<TriggerBaseline>;

  /**
   * ONE bounded inspection: is there a new matching event past the baseline? Non-matching events
   * are ignored (not consumed, not dedup-recorded). Implementations do not sleep, loop, or
   * schedule — pacing belongs to the orchestrator.
   */
  captureNext(
    context: LiveCaptureContext,
    baseline: TriggerBaseline,
  ): Promise<CaptureAttemptResult>;
}
