/**
 * @jest-environment node
 *
 * Pure async-copy poller (SMOKE-WRITE-33) — the bounded monitor-URL completion loop
 * that lets the write-smoke harness finish OneDrive's async `/copy` and capture the
 * copied item's id. Driven entirely over injected fetch/clock/sleep — no network, no
 * real timers. Covers terminal success/failure, completed-without-id, timeout,
 * attempt exhaustion, transient-error retry, malformed bodies, backoff, and the
 * trusted-monitor-URL gate.
 */
import {
  backoffMs,
  classifyStatus,
  DEFAULT_COPY_POLL_BUDGET,
  extractItemIdFromResourceUrl,
  isTrustedGraphMonitorUrl,
  monitorUrlHost,
  pollAsyncCopyCompletion,
  type AsyncOperationStatus,
  type PollBudget,
} from "@/tests/smoke-actions/asyncCopyCompletion";

/** A fake clock that only advances when `sleep` is called (deterministic). */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

/** A scripted status source. An `Error` element is THROWN (transient). Last element repeats. */
function queued(items: readonly (AsyncOperationStatus | Error)[]) {
  let i = 0;
  return async (): Promise<AsyncOperationStatus> => {
    const it = items[Math.min(i, items.length - 1)]!;
    i++;
    if (it instanceof Error) throw it;
    return it;
  };
}

const FAST: PollBudget = { maxAttempts: 10, baseIntervalMs: 1, maxIntervalMs: 1, totalTimeoutMs: 1_000_000 };

describe("classifyStatus", () => {
  it("maps completed -> success (case-insensitive)", () => {
    expect(classifyStatus("completed")).toBe("success");
    expect(classifyStatus("Completed")).toBe("success");
  });
  it("maps failed / cancelled / deleteFailed -> failure", () => {
    expect(classifyStatus("failed")).toBe("failure");
    expect(classifyStatus("cancelled")).toBe("failure");
    expect(classifyStatus("canceled")).toBe("failure");
    expect(classifyStatus("deleteFailed")).toBe("failure");
  });
  it("maps inProgress / notStarted / unknown / null -> pending", () => {
    expect(classifyStatus("inProgress")).toBe("pending");
    expect(classifyStatus("notStarted")).toBe("pending");
    expect(classifyStatus("waiting")).toBe("pending");
    expect(classifyStatus(null)).toBe("pending");
  });
});

describe("backoffMs", () => {
  it("grows exponentially but is capped at maxIntervalMs", () => {
    const b: PollBudget = { maxAttempts: 9, baseIntervalMs: 500, maxIntervalMs: 4000, totalTimeoutMs: 99 };
    expect(backoffMs(0, b)).toBe(500);
    expect(backoffMs(1, b)).toBe(1000);
    expect(backoffMs(2, b)).toBe(2000);
    expect(backoffMs(3, b)).toBe(4000);
    expect(backoffMs(4, b)).toBe(4000); // capped
    expect(backoffMs(20, b)).toBe(4000); // never overflows past the cap
  });
});

describe("extractItemIdFromResourceUrl", () => {
  it("pulls the id out of a .../items/{id} url", () => {
    expect(extractItemIdFromResourceUrl("https://graph.microsoft.com/v1.0/drives/d!1/items/01ABC?x=1")).toBe("01ABC");
  });
  it("url-decodes the id segment", () => {
    expect(extractItemIdFromResourceUrl("https://graph.microsoft.com/v1.0/items/a%20b")).toBe("a b");
  });
  it("returns null when there is no /items/{id} segment", () => {
    expect(extractItemIdFromResourceUrl("https://graph.microsoft.com/v1.0/operations/op-1")).toBeNull();
  });
});

describe("isTrustedGraphMonitorUrl", () => {
  const BASE = "https://graph.microsoft.com";
  it("accepts a URL on the same host + scheme as the Graph base", () => {
    expect(isTrustedGraphMonitorUrl("https://graph.microsoft.com/v1.0/operations/op-1", BASE)).toBe(true);
  });
  it("accepts the real Graph operation-monitor hosts (HTTPS Microsoft-owned)", () => {
    // Observed live: copy monitor URLs are NOT on graph.microsoft.com but on Microsoft
    // operation infra (consumer OneDrive -> *.svc.ms; OneDrive for Business -> *.sharepoint.com).
    expect(isTrustedGraphMonitorUrl("https://gateway.api.svc.ms/v1.0/monitor/abc", BASE)).toBe(true);
    expect(isTrustedGraphMonitorUrl("https://contoso-my.sharepoint.com/_api/monitor/abc", BASE)).toBe(true);
    expect(isTrustedGraphMonitorUrl("https://api.onedrive.com/v1.0/monitor/abc", BASE)).toBe(true);
    expect(isTrustedGraphMonitorUrl("https://login.live.com/x", BASE)).toBe(true);
  });
  it("rejects a non-Microsoft host (no off-host fetch)", () => {
    expect(isTrustedGraphMonitorUrl("https://evil.example.com/op-1", BASE)).toBe(false);
    // A look-alike that only SUFFIXES a Microsoft brand in a foreign domain is rejected.
    expect(isTrustedGraphMonitorUrl("https://graph.microsoft.com.evil.com/op", BASE)).toBe(false);
    expect(isTrustedGraphMonitorUrl("https://svc.ms.evil.com/op", BASE)).toBe(false);
  });
  it("rejects a non-HTTPS Microsoft host (only the exact graph base may be non-https, for the mock)", () => {
    expect(isTrustedGraphMonitorUrl("http://api.onedrive.com/op", BASE)).toBe(false);
    expect(isTrustedGraphMonitorUrl("http://graph.microsoft.com/op", BASE)).toBe(false);
  });
  it("rejects a non-URL", () => {
    expect(isTrustedGraphMonitorUrl("not a url", BASE)).toBe(false);
    expect(isTrustedGraphMonitorUrl("", BASE)).toBe(false);
  });
  it("honors an e2e mock Graph base host", () => {
    expect(isTrustedGraphMonitorUrl("http://localhost:4000/v1.0/op", "http://localhost:4000")).toBe(true);
    expect(isTrustedGraphMonitorUrl("http://localhost:9999/v1.0/op", "http://localhost:4000")).toBe(false);
  });
});

describe("monitorUrlHost", () => {
  it("returns the host of a parseable URL", () => {
    expect(monitorUrlHost("https://gateway.api.svc.ms/v1.0/monitor/abc?x=1")).toBe("gateway.api.svc.ms");
  });
  it("returns 'unparseable' for a non-URL", () => {
    expect(monitorUrlHost("not a url")).toBe("unparseable");
  });
});

describe("pollAsyncCopyCompletion", () => {
  it("returns the resourceId on terminal completion (first poll)", async () => {
    const clock = fakeClock();
    const out = await pollAsyncCopyCompletion(FAST, {
      fetchStatus: queued([{ status: "completed", resourceId: "01COPY" }]),
      ...clock,
    });
    expect(out).toEqual({ ok: true, resourceId: "01COPY" });
  });

  it("polls through inProgress until completed", async () => {
    const clock = fakeClock();
    const out = await pollAsyncCopyCompletion(FAST, {
      fetchStatus: queued([
        { status: "notStarted", resourceId: null },
        { status: "inProgress", resourceId: null, percentageComplete: 50 },
        { status: "completed", resourceId: "01COPY" },
      ]),
      ...clock,
    });
    expect(out).toEqual({ ok: true, resourceId: "01COPY" });
  });

  it("fails on a terminal failure status (never a pass)", async () => {
    const clock = fakeClock();
    const out = await pollAsyncCopyCompletion(FAST, {
      fetchStatus: queued([{ status: "failed", resourceId: null }]),
      ...clock,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/terminal failure/i);
  });

  it("fails when completed but no resourceId (can't verify/clean -> never a pass)", async () => {
    const clock = fakeClock();
    const out = await pollAsyncCopyCompletion(FAST, {
      fetchStatus: queued([{ status: "completed", resourceId: null }]),
      ...clock,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/no resourceId/i);
  });

  it("retries a transient fetch throw, then succeeds", async () => {
    const clock = fakeClock();
    const out = await pollAsyncCopyCompletion(FAST, {
      fetchStatus: queued([new Error("ECONNRESET"), { status: "completed", resourceId: "01COPY" }]),
      ...clock,
    });
    expect(out).toEqual({ ok: true, resourceId: "01COPY" });
  });

  it("times out (total duration) when the op never completes", async () => {
    const clock = fakeClock();
    const budget: PollBudget = { maxAttempts: 1000, baseIntervalMs: 1000, maxIntervalMs: 1000, totalTimeoutMs: 3000 };
    const out = await pollAsyncCopyCompletion(budget, {
      fetchStatus: queued([{ status: "inProgress", resourceId: null }]),
      ...clock,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/timed out/i);
  });

  it("stops after maxAttempts even with a generous time budget", async () => {
    const clock = fakeClock();
    const budget: PollBudget = { maxAttempts: 3, baseIntervalMs: 1, maxIntervalMs: 1, totalTimeoutMs: 1_000_000 };
    let calls = 0;
    const out = await pollAsyncCopyCompletion(budget, {
      fetchStatus: async () => {
        calls++;
        return { status: "inProgress", resourceId: null };
      },
      ...clock,
    });
    expect(out.ok).toBe(false);
    expect(calls).toBe(3); // bounded — no unbounded loop
  });

  it("treats a malformed (status:null) body as pending, then completes", async () => {
    const clock = fakeClock();
    const out = await pollAsyncCopyCompletion(FAST, {
      fetchStatus: queued([
        { status: null, resourceId: null },
        { status: "completed", resourceId: "01COPY" },
      ]),
      ...clock,
    });
    expect(out).toEqual({ ok: true, resourceId: "01COPY" });
  });

  it("exposes a sane default budget (bounded)", () => {
    expect(DEFAULT_COPY_POLL_BUDGET.maxAttempts).toBeGreaterThan(0);
    expect(DEFAULT_COPY_POLL_BUDGET.totalTimeoutMs).toBeGreaterThan(0);
    expect(DEFAULT_COPY_POLL_BUDGET.maxIntervalMs).toBeLessThanOrEqual(DEFAULT_COPY_POLL_BUDGET.totalTimeoutMs);
  });
});
