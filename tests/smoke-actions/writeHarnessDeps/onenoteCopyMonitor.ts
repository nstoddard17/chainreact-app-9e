/**
 * Write smoke harness deps — Microsoft OneNote async `copyToSection` operation poller.
 *
 * The production `copy_page` action wraps Graph
 * `POST /me/onenote/pages/{id}/copyToSection`, which is **asynchronous**: Graph
 * returns 202 + an `Operation-Location` header and does NOT include the new page id.
 * The handler honestly returns `{ operationLocation, success:true }` (success = "Graph
 * accepted", not "copy complete") and deliberately does NOT poll. The write-smoke
 * harness, however, needs the COMPLETED copy's page id to verify it landed and to clean
 * it up, so it polls the operation URL to terminal completion HERE — smoke-only,
 * READ-ONLY, never through the engine, never in the production handler.
 *
 * Owns the (provider, action) pair `("microsoft-onenote", "copy_monitor")` — a
 * SMOKE-ONLY pseudo-action invoked by the harness's `completeAsync` phase (NOT a
 * registered, user-facing action). Returns null for anything else so the composer
 * tries the next reader. (The OneDrive `copy_monitor` seam checks for its own provider
 * and returns null for OneNote, so the shared action name never collides.)
 *
 * DIFFERENCE FROM THE ONEDRIVE COPY MONITOR (`copyMonitor.ts`):
 *   - OneDrive's `/copy` monitor is a PRE-AUTHENTICATED operation-status URL on a
 *     `*.svc.ms` / `*.sharepoint.com` host, polled with NO bearer token.
 *   - OneNote's operation lives on the Graph API host itself
 *     (`graph.microsoft.com/v1.0/me/onenote/operations/{id}`) and is an AUTHENTICATED
 *     Graph endpoint, so this poll sends a bearer token via `refreshAndRetry` (the same
 *     refresh-safe seam every other OneNote read-back uses). No host allow-list change
 *     is needed: `isTrustedGraphMonitorUrl` already accepts the exact Graph base host.
 *
 * SAFETY:
 *   - URL TRUST: only an operation URL on the configured Graph host is ever fetched
 *     (`isTrustedGraphMonitorUrl`) — no arbitrary URL, even if the execute output were
 *     tampered. A redirect that leaves the trusted host is rejected too.
 *   - BOUNDED: capped attempts + total duration + capped backoff
 *     (`DEFAULT_COPY_POLL_BUDGET`); the loop can never run unbounded.
 *   - REFRESH-SAFE AUTH: the GET runs inside a `refreshAndRetry` apiCall lambda (per
 *     the seam-refresh-guard invariant) so a 401 refreshes + retries once.
 *   - SANITIZED OUTPUT: only `{ pageId }` (the copied OneNote page id) — never titles,
 *     URLs, body content, or raw provider payloads.
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { pagesList } from "@/integrations/microsoft-onenote/api/pagesList";
import {
  DEFAULT_COPY_POLL_BUDGET,
  isTrustedGraphMonitorUrl,
  monitorUrlHost,
  pollAsyncCopyCompletion,
  type AsyncOperationStatus,
} from "../asyncCopyCompletion";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Bounded budget for the durable-copy list-retry (absorbs OneNote list lag). */
const DURABLE_LIST_BUDGET = { maxAttempts: 8, backoffMs: 750, capMs: 6000 } as const;

/** A durable-discovery pick outcome. Pure, so it unit-tests without a network. */
export type DurablePickOutcome =
  | { readonly ok: true; readonly pageId: string }
  | { readonly ok: false; readonly ambiguous: boolean; readonly reason: string };

/**
 * Pick the DURABLE copied OneNote page from a section listing.
 *
 * OneNote's async `copyToSection` returns an ephemeral/staging page id that Graph may
 * later report as deleted, so the ledger id must instead be the page that actually
 * landed in the target section. The source page + its copy share the run-marked title
 * (`{{smokeMarker}}page`), so the copy is the marker page whose id differs from the
 * source. The run marker carries the unique run token, so ONLY this run's two pages can
 * match — a foreign / prior-run page never collides. Deterministic + pure:
 *   - exactly one marker page != source  -> that is the copy.
 *   - zero                                -> not landed yet (caller retries within budget).
 *   - more than one                       -> ambiguous; never guess (caller fails).
 */
export function pickDurableCopiedPage(
  pages: readonly { readonly id: string; readonly title?: string }[],
  marker: string,
  sourcePageId: string,
): DurablePickOutcome {
  const matches = pages.filter(
    (p) => typeof p.title === "string" && p.title.startsWith(marker) && p.id !== sourcePageId,
  );
  if (matches.length === 1) return { ok: true, pageId: matches[0]!.id };
  if (matches.length === 0) {
    return { ok: false, ambiguous: false, reason: "durable copied page not found (marker page != source absent)" };
  }
  return { ok: false, ambiguous: true, reason: `ambiguous durable copy discovery: ${matches.length} marker pages != source` };
}

/**
 * Pull a OneNote page id from an operation `resourceLocation` of the shape
 * `.../onenote/pages/{id}` (terminal completion may surface the new page via
 * `resourceLocation` rather than `resourceId`). Returns null when absent. Pure.
 */
export function extractPageIdFromResourceUrl(url: string): string | null {
  const m = url.match(/\/pages\/([^/?#]+)/);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * Normalize a GET of the OneNote copy `Location` URL into an `AsyncOperationStatus`.
 *
 * **Verified live (SMOKE-WRITE-35):** OneNote's `copyToSection` 202 puts the copy's
 * **`Location` header pointing directly at the new PAGE resource**
 * (`/me/onenote/pages/{id}`), and that URL is readable (200) almost immediately. The
 * 202 *body* is a separate async-operation resource (`{ id, status:"not started" }`),
 * but the `Location` URL itself resolves to the finished page — there is no
 * status-bearing operation endpoint to poll. So this normalizer handles BOTH shapes:
 *
 *   - **Operation resource** (`{ status, resourceId?, resourceLocation? }`) — kept for
 *     spec/forward-compat: pass the status through; `resourceId` (or a `resourceLocation`
 *     `/pages/{id}` parse) is the new page id.
 *   - **Page resource** (no `status`, but has `id` + page fields) — the actual OneNote
 *     behavior: the copy is DONE; treat as `completed` with `resourceId = body.id`.
 *
 * `status` is checked first, so an operation resource (whose `id` is the OPERATION id,
 * not the page id) never mistakes its operation id for the page id. Pure.
 */
export function normalizeOneNoteOperation(body: {
  status?: unknown;
  resourceId?: unknown;
  resourceLocation?: unknown;
  id?: unknown;
}): AsyncOperationStatus {
  if (typeof body.status === "string") {
    let resourceId = typeof body.resourceId === "string" ? body.resourceId : null;
    if (!resourceId && typeof body.resourceLocation === "string") {
      resourceId = extractPageIdFromResourceUrl(body.resourceLocation);
    }
    return { status: body.status, resourceId, percentageComplete: null };
  }
  // No `status` → the Location URL resolved to the copied PAGE itself. The copy is
  // complete; its `id` is the new page id.
  if (typeof body.id === "string") {
    return { status: "completed", resourceId: body.id, percentageComplete: 100 };
  }
  return { status: null, resourceId: null };
}

/**
 * One bounded, AUTHENTICATED read of the OneNote operation URL, normalized to an
 * `AsyncOperationStatus`. Re-validates the FINAL response URL stays on the trusted
 * Graph host (a redirect can never walk us off-host). Throws `Unauthorized401Error` on
 * 401 (so `refreshAndRetry` refreshes + retries); other non-OK responses throw so the
 * poller retries them as transient within the budget.
 */
async function fetchOneNoteOperation(
  monitorUrl: string,
  accessToken: string,
): Promise<AsyncOperationStatus> {
  const res = await fetch(monitorUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new Unauthorized401Error("OneNote operation poll returned HTTP 401");
  }
  if (!isTrustedGraphMonitorUrl(res.url || monitorUrl, graphApiBase())) {
    throw new Error("OneNote operation poll redirected off the trusted Graph host");
  }
  if (!res.ok) {
    throw new Error(`OneNote operation poll HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    status?: unknown;
    resourceId?: unknown;
    resourceLocation?: unknown;
  };
  return normalizeOneNoteOperation(body);
}

/**
 * Smoke read-back: `microsoft-onenote:copy_monitor` — poll the trusted Graph OneNote
 * operation URL to terminal completion and return the COPIED page id. Returns null for
 * any other (provider, action).
 */
export async function onenoteCopyMonitorSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "microsoft-onenote" || input.action !== "copy_monitor") return null;

  const monitorUrl = input.config.monitorUrl;
  if (typeof monitorUrl !== "string" || monitorUrl.length === 0) {
    return { ok: false, output: null, reason: "onenote copy_monitor: missing operation URL" };
  }
  // Trust-gate BEFORE any fetch — never touch an arbitrary URL. The refused HOST (a
  // public Microsoft domain, never a path/token/query) is surfaced for diagnosability.
  if (!isTrustedGraphMonitorUrl(monitorUrl, graphApiBase())) {
    return {
      ok: false,
      output: null,
      reason: `onenote copy_monitor: refused untrusted operation URL (host: ${monitorUrlHost(monitorUrl)})`,
    };
  }

  const integration = await getActiveForExecution(ctx.accountId, "microsoft-onenote", null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    return { ok: false, output: null, reason: "microsoft-onenote not connected" };
  }

  const outcome = await pollAsyncCopyCompletion(DEFAULT_COPY_POLL_BUDGET, {
    // Authenticated, refresh-safe per-attempt read (vs OneDrive's unauthenticated poll).
    fetchStatus: () =>
      refreshAndRetry({
        accountId: ctx.accountId,
        provider: "microsoft-onenote",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => fetchOneNoteOperation(monitorUrl, accessToken),
      }),
    sleep,
    now: () => Date.now(),
  });
  if (!outcome.ok) return { ok: false, output: null, reason: outcome.reason };

  // DURABLE-ID PATH: when the fixture supplies the target section + run marker + source
  // page id, IGNORE the poll's ephemeral resourceId (OneNote copyToSection returns a
  // staging id Graph may later report as deleted) and instead discover the page that
  // actually landed in the section. Absent those inputs -> legacy behavior (the poll id).
  const sectionId = typeof input.config.sectionId === "string" ? input.config.sectionId : null;
  const marker = typeof input.config.marker === "string" ? input.config.marker : null;
  const sourcePageId = typeof input.config.sourcePageId === "string" ? input.config.sourcePageId : null;
  if (sectionId === null || marker === null || sourcePageId === null) {
    // Bounded + sanitized: ONLY the copied page id (for ledger capture + verify).
    return { ok: true, output: { pageId: outcome.resourceId }, reason: null };
  }

  // Bounded list-retry: the copy is complete (poll said so) but may take a moment to
  // surface in the section listing. Each list runs inside refreshAndRetry (seam invariant).
  let waited = 0;
  let lastReason = "durable copied page not found in the smoke section";
  for (let attempt = 0; attempt < DURABLE_LIST_BUDGET.maxAttempts; attempt++) {
    let pages: { id: string; title?: string }[] | null = null;
    try {
      const listed = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: "microsoft-onenote",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => pagesList({ accessToken, sectionId, top: 100 }),
      });
      pages = listed.pages;
    } catch (err) {
      lastReason = `durable copy discovery list failed: ${(err as Error).message}`;
    }
    if (pages) {
      const pick = pickDurableCopiedPage(pages, marker, sourcePageId);
      if (pick.ok) {
        // Sanitized: ONLY the DURABLE copied page id (for ledger capture + verify + cleanup).
        return { ok: true, output: { pageId: pick.pageId }, reason: null };
      }
      lastReason = pick.reason;
      // Ambiguity never resolves by waiting -> fail fast (never guess which page).
      if (pick.ambiguous) return { ok: false, output: null, reason: pick.reason };
    }
    if (attempt < DURABLE_LIST_BUDGET.maxAttempts - 1 && waited < DURABLE_LIST_BUDGET.capMs) {
      const backoff = Math.min(DURABLE_LIST_BUDGET.backoffMs, DURABLE_LIST_BUDGET.capMs - waited);
      if (backoff <= 0) break;
      await sleep(backoff);
      waited += backoff;
    }
  }
  return { ok: false, output: null, reason: lastReason };
}
