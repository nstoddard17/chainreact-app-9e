/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-2 — the scheduled, NON-DESTRUCTIVE billing
 * reconciliation cron. This is the route that actually appears in `vercel.json`, so its
 * safety properties are the ones that run unattended in production.
 *
 * Proves: cron auth gates it; it reconciles billing only; it can never purge (asserted
 * structurally, not just behaviourally); repeated runs are idempotent; one account's failure
 * does not abort the batch; and the response is counts-only with no sensitive identifier.
 */

const mockRequireCronAuth = jest.fn();
const mockReconcile = jest.fn();

jest.mock("@/services/cron/auth", () => ({
  requireCronAuth: (...a: unknown[]) => mockRequireCronAuth(...a),
}));
// ACCOUNT-BILLING-LIFECYCLE-3 — the canonical ops-signal path (ops_signal_events →
// evaluate-ops-alerts). Mocked so the failure signal can be asserted without a DB.
const mockRecordCronRun = jest.fn();
jest.mock("@/services/observability/signalRecorders", () => ({
  recordCronRun: (...a: unknown[]) => mockRecordCronRun(...a),
  // Pass-through wrapper: the heartbeat itself is proven by its own suite.
  withCronHeartbeat: (_name: string, handler: (r: Request) => Promise<Response>) => handler,
}));

jest.mock("@/services/accounts/accountPurge", () => ({
  reconcilePendingDeletionBilling: (...a: unknown[]) => mockReconcile(...a),
  // Present in the real module — deliberately NOT imported by this route.
  purgeDuePendingAccounts: jest.fn(),
  purgeAccount: jest.fn(),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET, POST } from "@/app/api/cron/reconcile-deletion-billing/route";

const CLEAN = { scanned: 0, canceled: 0, alreadyClear: 0, failed: 0 };

function req(method = "POST") {
  return new Request("https://app.example.test/api/cron/reconcile-deletion-billing", {
    method,
  });
}

beforeEach(() => {
  mockRequireCronAuth.mockReset();
  mockReconcile.mockReset().mockResolvedValue(CLEAN);
  mockRecordCronRun.mockReset().mockResolvedValue(undefined);
});

describe("auth", () => {
  it("401s an unauthorized caller and never reconciles", async () => {
    mockRequireCronAuth.mockReturnValueOnce({
      authorized: false, message: "Unauthorized", status: 401,
    });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("500s when CRON_SECRET is unset (misconfig) and never reconciles", async () => {
    mockRequireCronAuth.mockReturnValueOnce({
      authorized: false,
      message: "Server misconfiguration: CRON_SECRET is not set.",
      status: 500,
    });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("runs on authorized GET (Vercel cron sends GET)", async () => {
    mockRequireCronAuth.mockReturnValueOnce({ authorized: true });
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });
});

describe("behavior", () => {
  it("returns the reconciliation counts", async () => {
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile.mockResolvedValueOnce({
      scanned: 4, canceled: 2, alreadyClear: 1, failed: 1,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, scanned: 4, canceled: 2, alreadyClear: 1, failed: 1,
    });
  });

  it("does NOT depend on the destructive-purge flag — it runs regardless", async () => {
    // The route imports neither the flag nor the purge service; there is no configuration
    // under which reconciliation is skipped for an authorized caller.
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    delete process.env.ENABLE_ACCOUNT_PURGE_CRON;
    await POST(req());
    process.env.ENABLE_ACCOUNT_PURGE_CRON = "true";
    await POST(req());
    delete process.env.ENABLE_ACCOUNT_PURGE_CRON;
    expect(mockReconcile).toHaveBeenCalledTimes(2);
  });

  it("is idempotent across repeated invocations", async () => {
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile
      .mockResolvedValueOnce({ scanned: 1, canceled: 1, alreadyClear: 0, failed: 0 })
      .mockResolvedValueOnce({ scanned: 1, canceled: 0, alreadyClear: 1, failed: 0 });

    const first = await (await POST(req())).json();
    const second = await (await POST(req())).json();

    expect(first.canceled).toBe(1);
    // The second pass finds the work already done — no duplicate cancellation.
    expect(second.canceled).toBe(0);
    expect(second.alreadyClear).toBe(1);
  });

  it("reports partial failure as counts, still 200 (the batch is not aborted)", async () => {
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile.mockResolvedValueOnce({
      scanned: 5, canceled: 3, alreadyClear: 1, failed: 1,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failed).toBe(1);
    expect(body.canceled).toBe(3);
  });

  it("500s with a generic message when the sweep itself throws", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Deletion-billing reconciliation cron failed.",
    });
    errSpy.mockRestore();
  });
});

describe("no-leak", () => {
  it("responds with counts ONLY — no account, user, customer, subscription, or team id", async () => {
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile.mockResolvedValueOnce({
      scanned: 2, canceled: 1, alreadyClear: 1, failed: 0,
    });
    const res = await POST(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(
      ["alreadyClear", "canceled", "failed", "ok", "scanned"].sort(),
    );
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/acct[-_]|user[-_]|cus_|sub_|sk_|@/);
    // Every value is a boolean or a number — nothing that could carry a name or an id.
    for (const v of Object.values(body)) {
      expect(["boolean", "number"]).toContain(typeof v);
    }
  });

  it("leaks no Stripe/DB detail in the error path", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile.mockRejectedValueOnce(
      new Error("relation account_billing sub_123 cus_456 does not exist"),
    );
    const res = await POST(req());
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/sub_|cus_|account_billing/);
    errSpy.mockRestore();
  });
});

/**
 * Structural guarantee — the strongest safety property this route has. It is not merely
 * "purge is flag-gated here"; the route has NO PATH to destructive code at all.
 */
describe("structurally non-destructive", () => {
  const raw = readFileSync(
    join(process.cwd(), "app/api/cron/reconcile-deletion-billing/route.ts"),
    "utf8",
  );
  // Strip comments: the route's doc block deliberately NAMES the purge flag and the purge
  // cron to explain why this route is separate from them. The guarantee under test is about
  // executable code, so prose must not trip it (nor be able to satisfy it).
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("imports only the reconciliation service function", () => {
    expect(source).toContain("reconcilePendingDeletionBilling");
    expect(source).not.toContain("purgeDuePendingAccounts");
    expect(source).not.toContain("purgeAccount");
  });

  it("never references the destructive-purge flag", () => {
    expect(source).not.toContain("isAccountPurgeCronEnabled");
    expect(source).not.toContain("ENABLE_ACCOUNT_PURGE_CRON");
  });

  it("imports no delete/anonymize repository", () => {
    expect(source).not.toMatch(/accountPurgeRepo|repositories\/accountPurge/);
    expect(source).not.toMatch(/ledgerAnonymization/);
    expect(source).not.toMatch(/deleteAuthUser|deleteAccount\b/);
  });
});

/**
 * ACCOUNT-BILLING-LIFECYCLE-3 — operational visibility.
 *
 * A partially-failed sweep still returns HTTP 200 (one account's Stripe outage must not fail
 * the tick), so the heartbeat alone would record `ok` and nobody would ever learn that
 * departing customers are still being billed. `failed > 0` therefore emits an explicit
 * `failed` cron signal through the SAME path every other cron problem uses.
 */
describe("failure visibility", () => {
  it("failed = 0 records no failure signal — just the normal safe summary", async () => {
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile.mockResolvedValueOnce({
      scanned: 3, canceled: 2, alreadyClear: 1, failed: 0,
    });

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(mockRecordCronRun).not.toHaveBeenCalled();
  });

  it("failed > 0 emits the canonical cron failure signal with a bounded category", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile.mockResolvedValueOnce({
      scanned: 5, canceled: 3, alreadyClear: 1, failed: 1,
    });

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "reconcile-deletion-billing",
      "failed",
      "billing_cancellation_failed",
    );
    errSpy.mockRestore();
  });

  it("the failure log carries safe aggregates ONLY — no identifiers", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile.mockResolvedValueOnce({
      scanned: 4, canceled: 2, alreadyClear: 1, failed: 1,
    });

    await POST(req());

    const logged = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/reconcile_deletion_billing\.failures/);
    // Required safe fields.
    for (const field of ["scanned", "attempted", "succeeded", "failed", "errorCategory", "at"]) {
      expect(logged).toContain(field);
    }
    // Forbidden content.
    expect(logged).not.toMatch(/acct[-_]|user[-_]|cus_|sub_|sk_|@|price_/);
    errSpy.mockRestore();
  });

  it("a failing item does not abort the batch — successes are still reported", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCronAuth.mockReturnValue({ authorized: true });
    mockReconcile.mockResolvedValueOnce({
      scanned: 10, canceled: 7, alreadyClear: 2, failed: 1,
    });

    const body = await (await POST(req())).json();

    expect(body.canceled).toBe(7);
    expect(body.failed).toBe(1);
    expect(body.scanned).toBe(10);
    errSpy.mockRestore();
  });
});
