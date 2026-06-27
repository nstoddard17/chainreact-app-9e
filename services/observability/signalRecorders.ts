import * as opsSignalEvents from "@/repositories/opsSignalEvents";
import type { OpsSignalOutcome } from "@/repositories/opsSignalEvents";

/**
 * Ops signal producers (Phase 8b). Thin, NEVER-THROW wrappers that write to
 * ops_signal_events — a recorder failure must never break the cron tick or the
 * billing webhook it instruments. They pass only safe identifiers/outcomes.
 */

export async function recordCronRun(
  source: string,
  outcome: OpsSignalOutcome,
  detailCode: string | null = null,
): Promise<void> {
  try {
    await opsSignalEvents.record({ kind: "cron_run", source, outcome, detailCode });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "ops.signal.record_failed",
        kind: "cron_run",
        source,
        error: err instanceof Error ? err.message : "unknown",
      }),
    );
  }
}

export async function recordBillingWebhookFailure(detailCode: string): Promise<void> {
  try {
    await opsSignalEvents.record({
      kind: "billing_webhook_failure",
      source: "stripe_billing",
      outcome: "failed",
      detailCode,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "ops.signal.record_failed",
        kind: "billing_webhook_failure",
        error: err instanceof Error ? err.message : "unknown",
      }),
    );
  }
}

/**
 * Wrap a cron route `handle` so each AUTHORIZED tick records a heartbeat
 * (`ok` on 2xx, `failed` otherwise) into ops_signal_events. 401s are skipped
 * (unauthenticated probes are not real ticks and must not trigger a service-role
 * write). A thrown handler records a `fatal` heartbeat then rethrows so the route
 * still surfaces the error. Heartbeat recording never throws.
 */
export function withCronHeartbeat(
  name: string,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    let res: Response;
    try {
      res = await handler(request);
    } catch (err) {
      await recordCronRun(name, "failed", "fatal");
      throw err;
    }
    if (res.status !== 401) {
      await recordCronRun(name, res.ok ? "ok" : "failed", res.ok ? null : `http_${res.status}`);
    }
    return res;
  };
}
