/**
 * Write smoke harness deps — Microsoft OneDrive async `/copy` monitor poller.
 *
 * The production `copy_item` action returns `{ status: "pending", monitorUrl }` and
 * does NOT poll (Slice 8 V1-rot fix — long waits exceed serverless timeouts). The
 * write-smoke harness needs the COMPLETED copy's id to verify it landed and to clean
 * it up, so it polls the monitor URL to terminal completion HERE — smoke-only,
 * READ-ONLY, never through the engine, never in the production handler.
 *
 * Owns the (provider, action) pair `("microsoft-onedrive", "copy_monitor")` — a
 * SMOKE-ONLY pseudo-action invoked by the harness's `completeAsync` phase (NOT a
 * registered, user-facing action). Returns null for anything else so the composer
 * tries the next reader.
 *
 * SAFETY:
 *   - URL TRUST: only a monitor URL on the configured Graph host is ever fetched
 *     (`isTrustedGraphMonitorUrl`) — no arbitrary URL, even if the execute output
 *     were tampered. A redirect that leaves the trusted host is rejected too.
 *   - BOUNDED: capped attempts + total duration + capped backoff
 *     (`DEFAULT_COPY_POLL_BUDGET`); the loop can never run unbounded.
 *   - NO TOKEN: the Graph copy monitor URL is an UNAUTHENTICATED operation-status
 *     endpoint, so the poll sends NO bearer token (and never reads/needs
 *     `decryptToken`). The INDEPENDENT verify (registered `get_file`) is the
 *     refresh-safe AUTHENTICATED read that proves the copy actually exists.
 *   - SANITIZED OUTPUT: only `{ itemId }` (the copied DriveItem id) — never names,
 *     URLs, or raw provider payloads.
 */
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  DEFAULT_COPY_POLL_BUDGET,
  extractItemIdFromResourceUrl,
  isTrustedGraphMonitorUrl,
  pollAsyncCopyCompletion,
  type AsyncOperationStatus,
} from "../asyncCopyCompletion";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * One bounded, UNAUTHENTICATED read of the Graph copy monitor URL, normalized to an
 * `AsyncOperationStatus`. Handles both terminal shapes:
 *   - 2xx with an AsyncJobStatus body `{ status, resourceId, percentageComplete }`;
 *   - a completion redirect to the new DriveItem (`{ id, ... }`) — id pulled from
 *     the body or the final redirected URL.
 * Re-validates the FINAL response URL stays on the trusted Graph host (a redirect
 * can never walk us off-host). A non-OK, non-redirect response throws so the poller
 * retries it as transient.
 */
async function fetchMonitorStatus(monitorUrl: string): Promise<AsyncOperationStatus> {
  const res = await fetch(monitorUrl, { method: "GET" });

  // A redirect is followed by default; the FINAL url must still be trusted.
  if (!isTrustedGraphMonitorUrl(res.url || monitorUrl, graphApiBase())) {
    throw new Error("monitor poll redirected off the trusted Graph host");
  }
  if (!res.ok) {
    throw new Error(`monitor poll HTTP ${res.status}`);
  }

  const body = (await res.json()) as {
    status?: unknown;
    resourceId?: unknown;
    percentageComplete?: unknown;
    id?: unknown;
  };

  // AsyncJobStatus shape (still in progress OR completed-with-id).
  if (typeof body.status === "string") {
    return {
      status: body.status,
      resourceId: typeof body.resourceId === "string" ? body.resourceId : null,
      percentageComplete:
        typeof body.percentageComplete === "number" ? body.percentageComplete : null,
    };
  }
  // Followed a completion redirect to the DriveItem itself.
  if (typeof body.id === "string") {
    return { status: "completed", resourceId: body.id, percentageComplete: 100 };
  }
  // Last resort: pull the id from the final resolved URL (.../items/{id}).
  const fromUrl = extractItemIdFromResourceUrl(res.url || monitorUrl);
  if (fromUrl) return { status: "completed", resourceId: fromUrl, percentageComplete: 100 };

  // Unrecognized body -> treat as still-pending (the poller retries within budget).
  return { status: null, resourceId: null };
}

/**
 * Smoke read-back: `microsoft-onedrive:copy_monitor` — poll the trusted Graph copy
 * monitor URL to terminal completion and return the COPIED item id. Returns null for
 * any other (provider, action).
 */
export async function copyMonitorSmokeReadBack(
  _ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "microsoft-onedrive" || input.action !== "copy_monitor") return null;

  const monitorUrl = input.config.monitorUrl;
  if (typeof monitorUrl !== "string" || monitorUrl.length === 0) {
    return { ok: false, output: null, reason: "copy_monitor: missing monitor URL" };
  }
  // Trust-gate BEFORE any fetch — never touch an arbitrary URL.
  if (!isTrustedGraphMonitorUrl(monitorUrl, graphApiBase())) {
    return { ok: false, output: null, reason: "copy_monitor: refused untrusted monitor URL" };
  }

  const outcome = await pollAsyncCopyCompletion(DEFAULT_COPY_POLL_BUDGET, {
    fetchStatus: () => fetchMonitorStatus(monitorUrl),
    sleep,
    now: () => Date.now(),
  });
  if (!outcome.ok) return { ok: false, output: null, reason: outcome.reason };

  // Bounded + sanitized: ONLY the copied DriveItem id (for ledger capture + verify).
  return { ok: true, output: { itemId: outcome.resourceId }, reason: null };
}
