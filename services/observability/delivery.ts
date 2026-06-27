import type { OpsAlertCandidate } from "@/contracts/opsAlert";

/**
 * Owner/internal ops-alert delivery (Phase 8b).
 *
 * Two surfaces, both safe:
 *   1. Structured log (ALWAYS) — `event: "ops.alert.fired"` with the safe alert
 *      fields. This is the guaranteed channel (Vercel logs) and needs no config.
 *   2. Optional outbound webhook (Slack/Discord incoming webhook URL from
 *      `OPS_ALERT_WEBHOOK_URL`). Unset → skipped; the durable ops_alert_events row
 *      + the log still fire (never a fake "OK", just no extra fan-out).
 *
 * NEVER throws — a delivery failure must not abort the evaluator tick or prevent
 * the alert being recorded. Payloads carry SAFE fields only (the candidate's
 * allow-listed context), never tokens/payloads/messages/PII.
 */

export interface OpsAlertDeliveryOutcome {
  logged: true;
  /** true delivered, false failed, null when no webhook configured. */
  webhookDelivered: boolean | null;
}

const WEBHOOK_TIMEOUT_MS = 5000;

function buildText(candidate: OpsAlertCandidate): string {
  return (
    `[OPS ${candidate.severity.toUpperCase()}] ${candidate.category} ` +
    `(${candidate.dedupeKey}) — ${candidate.recommendedAction} ` +
    `| count=${candidate.count} window=${candidate.windowLabel}`
  );
}

export async function deliverOpsAlert(
  candidate: OpsAlertCandidate,
  env: Record<string, string | undefined> = process.env,
): Promise<OpsAlertDeliveryOutcome> {
  // 1) Structured log — always. Safe fields only.
  console.info(
    JSON.stringify({
      event: "ops.alert.fired",
      category: candidate.category,
      severity: candidate.severity,
      dedupeKey: candidate.dedupeKey,
      count: candidate.count,
      windowLabel: candidate.windowLabel,
      context: candidate.context,
      recommendedAction: candidate.recommendedAction,
    }),
  );

  // 2) Optional outbound webhook.
  const url = env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!url) return { logged: true, webhookDelivered: null };

  const text = buildText(candidate);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // `text` (Slack) + `content` (Discord) so one URL works for either.
        body: JSON.stringify({ text, content: text }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.error(
        JSON.stringify({
          event: "ops.alert.webhook_failed",
          dedupeKey: candidate.dedupeKey,
          status: res.status,
        }),
      );
      return { logged: true, webhookDelivered: false };
    }
    return { logged: true, webhookDelivered: true };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "ops.alert.webhook_failed",
        dedupeKey: candidate.dedupeKey,
        error: err instanceof Error ? err.message : "unknown",
      }),
    );
    return { logged: true, webhookDelivered: false };
  }
}
