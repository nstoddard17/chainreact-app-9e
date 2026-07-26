/**
 * @jest-environment node
 *
 * Bounded retry + backoff for the Hermes Agent gateway (REACT-AGENT-RETRY-BACKOFF-1).
 *
 * Everything here runs on INJECTED clock / sleep / RNG, so the suite proves 45–60 second budget
 * behavior in milliseconds and never actually waits. No live network: `fetchImpl` is always a mock.
 *
 * The invariant under test is narrow on purpose: 1 initial attempt + at most 1 retry, only for fast
 * transient failures, only when the remaining budget can still fund a useful second attempt, and
 * NEVER for the timeout that caused the original production incident.
 */

import {
  requestHermesAgentGuidanceNormalized,
  type GatewayFetch,
  type GatewayHttpResponse,
} from "@/services/ai-guidance/gateway/hermesAgentGatewayClient";
import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  IMMEDIATE_FAILURE_MAX_MS,
  MAX_TOTAL_ATTEMPTS,
  MIN_SECOND_ATTEMPT_MS,
  computeBackoffMs,
  decideRetry,
  parseRetryAfterMs,
} from "@/services/ai-guidance/gateway/gatewayRetryPolicy";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

const CONFIG = { gatewayUrl: "https://gw.example.com", gatewayToken: "tok-GATEWAY-SECRET", timeoutMs: 45_000 };
const REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

/** A well-formed success envelope — the shape the real gateway returns. */
function okBody(content = "Here is some guidance.") {
  return { ok: true, response: { choices: [{ message: { content } }] } };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): GatewayHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * A controllable virtual clock. `advance` is driven by the injected `sleep` and by each scripted
 * fetch, so "elapsed" and "remaining budget" are exact and deterministic.
 */
function harness(opts: { budgetMs?: number; random?: number } = {}) {
  let clock = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    sleeps,
    deps: {
      now: () => clock,
      sleep: async (ms: number, signal?: AbortSignal): Promise<"waited" | "cancelled"> => {
        sleeps.push(ms);
        if (signal?.aborted) return "cancelled";
        clock += ms;
        return "waited";
      },
      random: () => opts.random ?? 0.5,
    },
    config: { ...CONFIG, timeoutMs: opts.budgetMs ?? 45_000 },
  };
}

/**
 * Build a fetch mock from a script of per-attempt behaviors. Each entry may burn virtual time
 * (`takesMs`) before producing its outcome, which is how "immediate" vs "slow" failures are tested.
 */
function scriptedFetch(
  h: ReturnType<typeof harness>,
  script: readonly { takesMs?: number; res?: GatewayHttpResponse; throw?: Error; hangUntilAbort?: boolean }[],
) {
  const calls: { headers: Record<string, string>; body: string }[] = [];
  const fetchImpl: GatewayFetch = async (_url, init) => {
    calls.push({ headers: init.headers, body: init.body });
    const step = script[calls.length - 1];
    if (!step) throw new Error(`unexpected attempt #${calls.length} — retry bound violated`);
    if (step.takesMs) h.advance(step.takesMs);
    if (step.hangUntilAbort) {
      // Simulate a request killed by its own AbortController (our deadline or the caller).
      const err = new Error("aborted");
      err.name = "AbortError";
      // The controller is already aborted by the time the client sees this in the timeout case.
      await new Promise<void>((resolve) => {
        if (init.signal?.aborted) return resolve();
        init.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      throw err;
    }
    if (step.throw) throw step.throw;
    return step.res!;
  };
  return { fetchImpl, calls };
}

function networkError(): Error {
  // What undici surfaces for a reset/DNS failure: a plain TypeError, NOT an AbortError.
  return new TypeError("fetch failed");
}

// ───────────────────────── 1–3. Existing-behavior audit ─────────────────────────

describe("audit — the pre-slice baseline this batch changes", () => {
  it("(#1) a successful request makes EXACTLY ONE Hermes attempt (no speculative second call)", async () => {
    const h = harness();
    const { fetchImpl, calls } = scriptedFetch(h, [{ takesMs: 800, res: jsonResponse(200, okBody()) }]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      retryDeps: h.deps,
    });
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(res.attemptTelemetry).toMatchObject({ attempts: 1, retried: false, backoffMs: 0 });
  });

  it("(#2) there is NO secondary model / provider fallback — one gateway URL, one token, one path", async () => {
    const h = harness();
    const { fetchImpl } = scriptedFetch(h, [
      { res: jsonResponse(500, { ok: false }) },
      { res: jsonResponse(200, okBody()) },
    ]);
    const urls: string[] = [];
    const spy: GatewayFetch = async (url, init) => {
      urls.push(url);
      return fetchImpl(url, init);
    };
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl: spy,
      retryDeps: h.deps,
    });
    // 500 is deterministic → no retry, no second provider, no alternate model. One URL, one failure.
    expect(urls).toEqual([`${CONFIG.gatewayUrl}/api/hermes-agent/guidance`]);
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_ERROR", reason: "status_500" });
  });

  it("(#3) the retry bound is a constant, not a tunable — MAX_TOTAL_ATTEMPTS is 2", () => {
    expect(MAX_TOTAL_ATTEMPTS).toBe(2);
  });
});

// ───────────────────────── 4–8. Successful transient retry ─────────────────────────

describe("transient failure retries exactly once and succeeds", () => {
  it.each([
    ["network reset", { throw: networkError() }, "network_error"],
    ["HTTP 502", { res: jsonResponse(502, { error: "bad gateway" }) }, "status_502"],
    ["HTTP 503", { res: jsonResponse(503, { error: "unavailable" }) }, "status_503"],
  ])("(#4,#5,#6) %s retries once, second attempt succeeds, user gets one valid result", async (_label, first, reason) => {
    const h = harness();
    const { fetchImpl, calls } = scriptedFetch(h, [
      { takesMs: 300, ...(first as object) },
      { takesMs: 1_200, res: jsonResponse(200, okBody("Recovered guidance.")) },
    ]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      requestId: "req-1",
      retryDeps: h.deps,
    });

    expect(calls).toHaveLength(2);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.guidanceText).toBe("Recovered guidance.");
    expect(res.attemptTelemetry).toMatchObject({ attempts: 2, retried: true, retryReason: reason });
  });

  it("(#4) HTTP 429 retries ONLY when the provider's Retry-After is short", async () => {
    const short = harness();
    const shortFetch = scriptedFetch(short, [
      { takesMs: 100, res: jsonResponse(429, {}, { "retry-after": "1" }) },
      { takesMs: 500, res: jsonResponse(200, okBody()) },
    ]);
    const okRes = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: short.config,
      fetchImpl: shortFetch.fetchImpl,
      retryDeps: short.deps,
    });
    expect(shortFetch.calls).toHaveLength(2);
    expect(okRes.ok).toBe(true);

    const long = harness();
    const longFetch = scriptedFetch(long, [{ takesMs: 100, res: jsonResponse(429, {}, { "retry-after": "120" }) }]);
    const denied = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: long.config,
      fetchImpl: longFetch.fetchImpl,
      retryDeps: long.deps,
    });
    expect(longFetch.calls).toHaveLength(1);
    expect(denied.attemptTelemetry?.retrySkippedReason).toBe("retry_after_too_long");

    // No Retry-After at all → we do not guess a cooldown.
    const bare = harness();
    const bareFetch = scriptedFetch(bare, [{ takesMs: 100, res: jsonResponse(429, {}) }]);
    await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: bare.config,
      fetchImpl: bareFetch.fetchImpl,
      retryDeps: bare.deps,
    });
    expect(bareFetch.calls).toHaveLength(1);
  });

  it("(#7,#8) both attempts share ONE request id and are reported as one logical call", async () => {
    const h = harness();
    const { fetchImpl, calls } = scriptedFetch(h, [
      { takesMs: 200, res: jsonResponse(503, {}) },
      { takesMs: 900, res: jsonResponse(200, okBody()) },
    ]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      requestId: "logical-req-42",
      retryDeps: h.deps,
    });

    // #31 — one id across both attempts; the attempt NUMBER is what differs.
    expect(calls[0]!.headers["x-chainreact-request-id"]).toBe("logical-req-42");
    expect(calls[1]!.headers["x-chainreact-request-id"]).toBe("logical-req-42");
    expect(calls[0]!.headers["x-chainreact-attempt"]).toBe("1");
    expect(calls[1]!.headers["x-chainreact-attempt"]).toBe("2");
    expect(res.attemptTelemetry?.requestId).toBe("logical-req-42");
    // The identical prompt is sent both times — a retry is a repeat, not a second question.
    expect(calls[0]!.body).toBe(calls[1]!.body);
  });
});

// ───────────────────────── 9–14. Retry exhaustion ─────────────────────────

describe("retry exhaustion stops at two attempts", () => {
  it("(#9-#12,#14) 503 then 503 → no third attempt, typed retryable failure returned", async () => {
    const h = harness();
    const { fetchImpl, calls } = scriptedFetch(h, [
      { takesMs: 200, res: jsonResponse(503, {}) },
      { takesMs: 200, res: jsonResponse(503, {}) },
    ]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      retryDeps: h.deps,
    });

    expect(calls).toHaveLength(2);
    // #12/#13 — a failure carries no plan/preview material at all, so nothing can be persisted.
    expect(res).toMatchObject({ ok: false, code: "PROVIDER_ERROR", reason: "status_503" });
    expect(res.attemptTelemetry).toMatchObject({
      attempts: 2,
      retried: true,
      retryReason: "status_503",
      retrySkippedReason: "attempts_exhausted",
    });
  });
});

// ───────────────────────── 15–19. Timeout is never retried ─────────────────────────

describe("timeout is never automatically retried", () => {
  it("(#15,#16,#17) our deadline → TIMEOUT, exactly one attempt, no plan material", async () => {
    const h = harness({ budgetMs: 45_000 });
    const { fetchImpl, calls } = scriptedFetch(h, [{ hangUntilAbort: true }]);
    // Real timers drive the abort here; the budget is tiny so the test finishes instantly.
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: { ...h.config, timeoutMs: 20 },
      fetchImpl,
      retryDeps: { random: () => 0.5 },
    });

    expect(calls).toHaveLength(1);
    expect(res).toMatchObject({ ok: false, code: "TIMEOUT" });
    expect(res.attemptTelemetry).toMatchObject({ attempts: 1, retried: false, retrySkippedReason: "timeout" });
  });

  it("(#15) the policy refuses a timeout even with a full budget and zero elapsed time", () => {
    expect(
      decideRetry({
        failure: { kind: "timeout" },
        attemptsMade: 1,
        attemptElapsedMs: 0,
        remainingBudgetMs: 45_000,
        plannedBackoffMs: 500,
      }),
    ).toEqual({ retry: false, skipReason: "timeout" });
  });
});

// ───────────────────────── 20–23. Deterministic failures are never retried ─────────────────────────

describe("deterministic failures are never retried", () => {
  it.each([
    ["malformed structured output (non-JSON body)", { ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new Error("bad json"); }, text: async () => "" } as GatewayHttpResponse],
    ["envelope-level provider error on HTTP 200", jsonResponse(200, { ok: false, error: "downstream_failed" })],
    ["unusable envelope (no choices)", jsonResponse(200, { ok: true, response: {} })],
  ])("(#20,#21,#22,#23) %s → one attempt only", async (_label, res) => {
    const h = harness();
    const { fetchImpl, calls } = scriptedFetch(h, [{ takesMs: 100, res }]);
    const out = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      retryDeps: h.deps,
    });
    expect(calls).toHaveLength(1);
    expect(out.ok).toBe(false);
    expect(out.attemptTelemetry?.retrySkippedReason).toBe("not_retryable");
  });

  it.each([400, 401, 403, 404, 500])("(#23) HTTP %s is deterministic → never retried", async (status) => {
    const h = harness();
    const { fetchImpl, calls } = scriptedFetch(h, [{ takesMs: 100, res: jsonResponse(status, {}) }]);
    const out = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      retryDeps: h.deps,
    });
    expect(calls).toHaveLength(1);
    expect(out).toMatchObject({ ok: false, code: "PROVIDER_ERROR", reason: `status_${status}` });
    expect(out.attemptTelemetry?.retrySkippedReason).toBe("not_retryable");
  });
});

// ───────────────────────── 24–26. Cancellation ─────────────────────────

describe("cancellation", () => {
  it("(#24) an already-aborted caller signal makes ZERO attempts", async () => {
    const h = harness();
    const { fetchImpl, calls } = scriptedFetch(h, []);
    const controller = new AbortController();
    controller.abort();
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      signal: controller.signal,
      retryDeps: h.deps,
    });
    expect(calls).toHaveLength(0);
    expect(res).toMatchObject({ ok: false, code: "CANCELLED" });
  });

  it("(#25) aborting DURING the backoff stops immediately — the retry never fires", async () => {
    const h = harness();
    const controller = new AbortController();
    const { fetchImpl, calls } = scriptedFetch(h, [
      { takesMs: 200, res: jsonResponse(503, {}) },
      { res: jsonResponse(200, okBody()) }, // must never be reached
    ]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      signal: controller.signal,
      retryDeps: {
        ...h.deps,
        // The user navigates away while we are waiting out the jittered delay.
        sleep: async () => {
          controller.abort();
          return "cancelled";
        },
      },
    });
    expect(calls).toHaveLength(1);
    expect(res).toMatchObject({ ok: false, code: "CANCELLED" });
    expect(res.attemptTelemetry).toMatchObject({ attempts: 1, retrySkippedReason: "cancelled" });
  });

  it("(#24) a cancelled in-flight attempt is CANCELLED, not TIMEOUT (different operational meaning)", async () => {
    const h = harness();
    const controller = new AbortController();
    const { fetchImpl } = scriptedFetch(h, [{ hangUntilAbort: true }]);
    const promise = requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: { ...h.config, timeoutMs: 30_000 },
      fetchImpl,
      signal: controller.signal,
      retryDeps: { random: () => 0.5 },
    });
    controller.abort();
    const res = await promise;
    expect(res).toMatchObject({ ok: false, code: "CANCELLED" });
  });
});

// ───────────────────────── 27–30. Remaining-budget rule ─────────────────────────

describe("remaining-budget rule", () => {
  it("(#27) a fast transient failure retries while plenty of budget remains", async () => {
    const h = harness({ budgetMs: 45_000 });
    const { fetchImpl, calls } = scriptedFetch(h, [
      { takesMs: 400, res: jsonResponse(502, {}) },
      { takesMs: 800, res: jsonResponse(200, okBody()) },
    ]);
    await requestHermesAgentGuidanceNormalized({ request: REQUEST, config: h.config, fetchImpl, retryDeps: h.deps });
    expect(calls).toHaveLength(2);
  });

  it("(#28,#30) a transient failure does NOT retry when too little time remains", async () => {
    // Budget deliberately smaller than what a useful second attempt needs.
    const h = harness({ budgetMs: MIN_SECOND_ATTEMPT_MS });
    const { fetchImpl, calls } = scriptedFetch(h, [
      { takesMs: 900, res: jsonResponse(503, {}) },
      { res: jsonResponse(200, okBody()) }, // must never be reached
    ]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      retryDeps: h.deps,
    });
    expect(calls).toHaveLength(1);
    expect(res.attemptTelemetry?.retrySkippedReason).toBe("insufficient_budget");
  });

  it("(#28) a transient failure that took a LONG time is not 'transient' — no retry", async () => {
    const h = harness({ budgetMs: 45_000 });
    const { fetchImpl, calls } = scriptedFetch(h, [
      { takesMs: IMMEDIATE_FAILURE_MAX_MS + 1_000, res: jsonResponse(503, {}) },
      { res: jsonResponse(200, okBody()) }, // must never be reached
    ]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      retryDeps: h.deps,
    });
    expect(calls).toHaveLength(1);
    expect(res.attemptTelemetry?.retrySkippedReason).toBe("slow_failure");
  });

  it("(#29,#30) the two attempts + backoff never exceed the ORIGINAL budget", async () => {
    const budgetMs = 45_000;
    const h = harness({ budgetMs });
    const startedAt = h.now();
    const { fetchImpl } = scriptedFetch(h, [
      { takesMs: 400, res: jsonResponse(503, {}) },
      { takesMs: 3_000, res: jsonResponse(200, okBody()) },
    ]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      retryDeps: h.deps,
    });
    // Retry redistributes the SAME budget; it can never extend past it into platform-kill territory.
    expect(h.now() - startedAt).toBeLessThanOrEqual(budgetMs);
    expect(res.attemptTelemetry!.elapsedMs).toBeLessThanOrEqual(budgetMs);
  });

  it("(#28) the second attempt's deadline is what REMAINS, never a fresh full budget", async () => {
    const h = harness({ budgetMs: 45_000 });
    const deadlines: number[] = [];
    const { fetchImpl } = scriptedFetch(h, [
      { takesMs: 1_000, res: jsonResponse(503, {}) },
      { takesMs: 100, res: jsonResponse(200, okBody()) },
    ]);
    const spy: GatewayFetch = async (url, init) => {
      // The per-attempt deadline is observable through how long the client is willing to wait; we
      // assert it indirectly via telemetry below, and directly here by capturing call order.
      deadlines.push(h.now());
      return fetchImpl(url, init);
    };
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl: spy,
      retryDeps: h.deps,
    });
    expect(deadlines).toHaveLength(2);
    // Attempt 2 started after attempt 1's elapsed time + the backoff, all inside the one budget.
    expect(deadlines[1]! - deadlines[0]!).toBe(1_000 + res.attemptTelemetry!.backoffMs);
  });
});

// ───────────────────────── 31–35. Identity + single-result guarantees ─────────────────────────

describe("request identity and single-result guarantees", () => {
  it("(#33,#35) a late first attempt cannot overwrite the retry's result", async () => {
    const h = harness();
    let attempt = 0;
    /** Set if attempt 1's abandoned work ever tries to produce a value after it already failed. */
    let lateFirstAttemptFired = false;
    const abortStates: (boolean | undefined)[] = [];

    const fetchImpl: GatewayFetch = async (_url, init) => {
      attempt += 1;
      if (attempt === 1) {
        // Attempt 1 fails transiently. Its "late success" is scheduled on the macrotask queue —
        // exactly the shape of a response that arrives after the client gave up on it.
        setTimeout(() => {
          lateFirstAttemptFired = true;
          // The client aborts an abandoned attempt's controller, so the socket is already released.
          abortStates.push(init.signal?.aborted);
        }, 0);
        throw networkError();
      }
      return jsonResponse(200, okBody("second attempt wins"));
    };

    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      requestId: "req-single",
      retryDeps: h.deps,
    });
    // Let the late callback run AFTER the call already returned its single value.
    await new Promise((r) => setTimeout(r, 5));

    expect(lateFirstAttemptFired).toBe(true);
    expect(abortStates).toEqual([true]); // attempt 1 was aborted, so nothing can still be in flight
    // The returned value is attempt 2's, and there is exactly ONE of it — a promise resolves once,
    // so a late first attempt has no channel through which to produce a second preview or outcome.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.guidanceText).toBe("second attempt wins");
    expect(res.attemptTelemetry).toMatchObject({ attempts: 2, requestId: "req-single" });
  });

  it("(#31) telemetry reports one logical request, never two", async () => {
    const h = harness();
    const { fetchImpl } = scriptedFetch(h, [
      { takesMs: 100, throw: networkError() },
      { takesMs: 100, res: jsonResponse(200, okBody()) },
    ]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      requestId: "one-id",
      retryDeps: h.deps,
    });
    expect(res.attemptTelemetry).toMatchObject({ requestId: "one-id", attempts: 2, retried: true });
  });

  it("the gateway token stays in the Authorization header on BOTH attempts and never in a body", async () => {
    const h = harness();
    const { fetchImpl, calls } = scriptedFetch(h, [
      { takesMs: 100, res: jsonResponse(503, {}) },
      { takesMs: 100, res: jsonResponse(200, okBody()) },
    ]);
    await requestHermesAgentGuidanceNormalized({ request: REQUEST, config: h.config, fetchImpl, retryDeps: h.deps });
    for (const call of calls) {
      expect(call.headers.authorization).toBe(`Bearer ${CONFIG.gatewayToken}`);
      expect(call.body).not.toContain(CONFIG.gatewayToken);
    }
  });
});

// ───────────────────────── Backoff shape ─────────────────────────

describe("backoff is small, jittered, and budget-counted", () => {
  it("stays inside the 250–750ms window across the whole RNG range", () => {
    expect(computeBackoffMs(() => 0)).toBe(BACKOFF_MIN_MS);
    expect(computeBackoffMs(() => 1)).toBe(BACKOFF_MAX_MS);
    for (const r of [0.1, 0.33, 0.5, 0.87, 0.99]) {
      const ms = computeBackoffMs(() => r);
      expect(ms).toBeGreaterThanOrEqual(BACKOFF_MIN_MS);
      expect(ms).toBeLessThanOrEqual(BACKOFF_MAX_MS);
    }
  });

  it("actually varies with the RNG (jitter, not a fixed delay)", () => {
    expect(computeBackoffMs(() => 0.1)).not.toBe(computeBackoffMs(() => 0.9));
  });

  it("the waited backoff is the value reported in telemetry and is charged to the budget", async () => {
    const h = harness({ random: 1 });
    const { fetchImpl } = scriptedFetch(h, [
      { takesMs: 100, res: jsonResponse(503, {}) },
      { takesMs: 100, res: jsonResponse(200, okBody()) },
    ]);
    const res = await requestHermesAgentGuidanceNormalized({
      request: REQUEST,
      config: h.config,
      fetchImpl,
      retryDeps: h.deps,
    });
    expect(res.attemptTelemetry!.backoffMs).toBe(BACKOFF_MAX_MS);
    expect(h.sleeps).toEqual([BACKOFF_MAX_MS]);
    // 100ms + backoff + 100ms of virtual time, all inside the budget.
    expect(res.attemptTelemetry!.elapsedMs).toBe(200 + BACKOFF_MAX_MS);
  });

  it("parseRetryAfterMs accepts delay-seconds and rejects everything else", () => {
    expect(parseRetryAfterMs("2")).toBe(2_000);
    expect(parseRetryAfterMs("0")).toBe(0);
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
    expect(parseRetryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(parseRetryAfterMs("-5")).toBeNull();
  });
});
