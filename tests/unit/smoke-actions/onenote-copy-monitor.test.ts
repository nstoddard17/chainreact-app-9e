/**
 * @jest-environment node
 *
 * OneNote async copy-monitor normalization (SMOKE-WRITE-35) — the pure helpers that
 * turn a Graph OneNote operation body into the shared `AsyncOperationStatus` the bounded
 * poller consumes. The authenticated network poll + trust gate are exercised live; these
 * tests pin the body/URL parsing without a network.
 */
import {
  extractPageIdFromResourceUrl,
  normalizeOneNoteOperation,
} from "@/tests/smoke-actions/writeHarnessDeps/onenoteCopyMonitor";
import {
  classifyStatus,
  isTrustedGraphMonitorUrl,
} from "@/tests/smoke-actions/asyncCopyCompletion";

describe("extractPageIdFromResourceUrl", () => {
  it("pulls the page id from a Graph onenote resourceLocation", () => {
    expect(
      extractPageIdFromResourceUrl(
        "https://graph.microsoft.com/v1.0/users/u1/onenote/pages/1-abc123!42",
      ),
    ).toBe("1-abc123!42");
  });

  it("decodes a percent-encoded page id and ignores query/fragment", () => {
    expect(
      extractPageIdFromResourceUrl("https://graph.microsoft.com/v1.0/me/onenote/pages/1-a%21b?x=1#f"),
    ).toBe("1-a!b");
  });

  it("returns null when there is no /pages/{id} segment", () => {
    expect(
      extractPageIdFromResourceUrl("https://graph.microsoft.com/v1.0/me/onenote/operations/op1"),
    ).toBeNull();
  });
});

describe("normalizeOneNoteOperation", () => {
  it("uses resourceId on a completed operation", () => {
    expect(
      normalizeOneNoteOperation({ status: "completed", resourceId: "1-pageABC" }),
    ).toEqual({ status: "completed", resourceId: "1-pageABC", percentageComplete: null });
  });

  it("falls back to parsing resourceLocation when resourceId is absent", () => {
    expect(
      normalizeOneNoteOperation({
        status: "completed",
        resourceLocation: "https://graph.microsoft.com/v1.0/me/onenote/pages/1-pageXYZ",
      }),
    ).toEqual({ status: "completed", resourceId: "1-pageXYZ", percentageComplete: null });
  });

  it("carries a still-running status with no id (poller keeps waiting)", () => {
    expect(normalizeOneNoteOperation({ status: "running" })).toEqual({
      status: "running",
      resourceId: null,
      percentageComplete: null,
    });
    // `running` classifies as pending so the bounded poll retries within budget.
    expect(classifyStatus("running")).toBe("pending");
  });

  it("a completed op with neither resourceId nor a parseable location yields no id", () => {
    // -> the poller reports completed-without-id -> VERIFY_FAILED (never a silent leak).
    expect(
      normalizeOneNoteOperation({ status: "completed", resourceLocation: "https://x/none" }),
    ).toEqual({ status: "completed", resourceId: null, percentageComplete: null });
  });

  it("PAGE resource (no status, has id+page fields) is treated as completed with the page id — SMOKE-WRITE-35", () => {
    // Verified live: OneNote's copy Location URL resolves to the copied PAGE itself
    // (no status-bearing operation), so a body with `id` + page fields IS the finished copy.
    expect(
      normalizeOneNoteOperation({
        id: "1-copiedPage",
        title: "crsmoke-page",
        contentUrl: "https://graph/…/content",
      } as { id: unknown }),
    ).toEqual({ status: "completed", resourceId: "1-copiedPage", percentageComplete: 100 });
  });

  it("an operation resource's own id is NOT mistaken for the page id (status wins)", () => {
    // The 202 operation body has BOTH an `id` (the OPERATION id) and a `status`. Status is
    // checked first, so the operation id never leaks in as the page id.
    expect(
      normalizeOneNoteOperation({ status: "not started", id: "operationId-not-a-page" }),
    ).toEqual({ status: "not started", resourceId: null, percentageComplete: null });
  });

  it("an empty body (no status, no id) is unrecognized (pending)", () => {
    expect(normalizeOneNoteOperation({})).toEqual({ status: null, resourceId: null });
  });
});

describe("OneNote operation URL trust", () => {
  it("trusts the exact Graph base host (OneNote operations live on graph.microsoft.com)", () => {
    const base = "https://graph.microsoft.com";
    expect(
      isTrustedGraphMonitorUrl(
        "https://graph.microsoft.com/v1.0/me/onenote/operations/op1",
        base,
      ),
    ).toBe(true);
  });

  it("rejects an off-Microsoft host", () => {
    expect(
      isTrustedGraphMonitorUrl("https://evil.example.com/onenote/operations/op1", "https://graph.microsoft.com"),
    ).toBe(false);
  });
});
