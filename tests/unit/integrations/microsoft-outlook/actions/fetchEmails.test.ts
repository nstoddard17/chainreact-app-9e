/**
 * @jest-environment node
 *
 * Tests for the fetch_emails action handler (Outlook Mail 2.2 Commit 3).
 * D-OM1 V1-shape: optional folder + query + dates + maxResults; Graph
 * $filter / $search mutual-exclusion handled inside wrapper; client-side
 * date filtering when query is set; bounded output (no envelope leakage).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockListMessages = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/listMessages", () => ({
  listMessages: (...args: unknown[]) => mockListMessages(...args),
}));

import { fetchEmails } from "@/integrations/microsoft-outlook/actions/fetchEmails";
import { FetchEmailsConfigSchema } from "@/integrations/microsoft-outlook/actions/fetchEmails.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockListMessages.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
    apiCall("ms-token"),
  );
});

function trigger(provider: string = "microsoft-outlook"): TriggerEvent {
  return {
    provider,
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

function makeGraphMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    subject: "Hello",
    from: {
      emailAddress: { name: "Alice", address: "alice@example.test" },
    },
    toRecipients: [
      { emailAddress: { name: "Bob", address: "bob@example.test" } },
    ],
    ccRecipients: [],
    receivedDateTime: "2026-05-10T12:00:00Z",
    bodyPreview: "Hi there...",
    hasAttachments: false,
    importance: "normal" as const,
    isRead: false,
    ...overrides,
  };
}

describe("fetch_emails action — no-query path", () => {
  it("calls listMessages with date filters when dates are set and no query", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        startDate: "2026-05-01T00:00:00Z",
        endDate: "2026-05-31T23:59:59Z",
        maxResults: 10,
      },
      triggerEvent: trigger(),
    });

    expect(mockListMessages).toHaveBeenCalledWith({
      accessToken: "ms-token",
      folderId: undefined,
      query: undefined,
      startDate: "2026-05-01T00:00:00Z",
      endDate: "2026-05-31T23:59:59Z",
      maxResults: 10,
    });
  });

  it("does NOT apply client-side date filter when no query is set", async () => {
    // Wrapper would have already applied $filter server-side; handler
    // trusts the response.
    mockListMessages.mockResolvedValue({
      value: [
        makeGraphMessage({
          id: "old",
          receivedDateTime: "2025-01-01T00:00:00Z",
        }),
        makeGraphMessage({
          id: "new",
          receivedDateTime: "2026-06-01T00:00:00Z",
        }),
      ],
    });

    const result = await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        startDate: "2026-05-01T00:00:00Z",
        maxResults: 10,
      },
      triggerEvent: trigger(),
    });

    // Both messages flow through — handler doesn't re-filter without query.
    const messages = result.output.messages as Array<{ id: string }>;
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.id)).toEqual(["old", "new"]);
  });

  it("forwards folderId to the wrapper", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { folderId: "inbox", maxResults: 10 },
      triggerEvent: trigger(),
    });

    expect(mockListMessages.mock.calls[0]![0].folderId).toBe("inbox");
  });
});

describe("fetch_emails action — query path", () => {
  it("forwards query to the wrapper and applies client-side date filter", async () => {
    mockListMessages.mockResolvedValue({
      value: [
        makeGraphMessage({
          id: "in-range-1",
          receivedDateTime: "2026-05-15T12:00:00Z",
        }),
        makeGraphMessage({
          id: "too-old",
          receivedDateTime: "2025-12-31T23:59:00Z",
        }),
        makeGraphMessage({
          id: "in-range-2",
          receivedDateTime: "2026-05-20T08:00:00Z",
        }),
        makeGraphMessage({
          id: "too-new",
          receivedDateTime: "2026-07-01T00:00:00Z",
        }),
      ],
    });

    const result = await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        query: "invoice",
        startDate: "2026-05-01T00:00:00Z",
        endDate: "2026-05-31T23:59:59Z",
        maxResults: 10,
      },
      triggerEvent: trigger(),
    });

    expect(mockListMessages.mock.calls[0]![0].query).toBe("invoice");

    const messages = result.output.messages as Array<{ id: string }>;
    expect(messages.map((m) => m.id)).toEqual(["in-range-1", "in-range-2"]);
    expect(result.output.count).toBe(2);
  });

  it("treats whitespace-only query as no-query", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { query: "   ", maxResults: 10 },
      triggerEvent: trigger(),
    });

    // Handler passes `undefined` to the wrapper so the wrapper takes
    // the $filter path.
    expect(mockListMessages.mock.calls[0]![0].query).toBeUndefined();
  });

  it("treats empty query as no-query", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { query: "", maxResults: 10 },
      triggerEvent: trigger(),
    });

    expect(mockListMessages.mock.calls[0]![0].query).toBeUndefined();
  });

  it("does NOT drop messages with unknown timestamps (defensive)", async () => {
    mockListMessages.mockResolvedValue({
      value: [
        makeGraphMessage({ id: "in-range", receivedDateTime: "2026-05-15T00:00:00Z" }),
        makeGraphMessage({ id: "no-ts", receivedDateTime: null }),
      ],
    });

    const result = await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        query: "x",
        startDate: "2026-05-01T00:00:00Z",
        endDate: "2026-05-31T23:59:59Z",
        maxResults: 10,
      },
      triggerEvent: trigger(),
    });

    const messages = result.output.messages as Array<{ id: string }>;
    expect(messages.map((m) => m.id)).toContain("no-ts");
  });
});

describe("fetch_emails action — output shape", () => {
  it("projects Graph envelopes to the bounded shape", async () => {
    mockListMessages.mockResolvedValue({
      value: [
        makeGraphMessage({
          id: "msg-1",
          subject: "Hello",
          from: {
            emailAddress: { name: "Alice", address: "alice@example.test" },
          },
          toRecipients: [
            {
              emailAddress: { name: "Bob", address: "bob@example.test" },
            },
          ],
          ccRecipients: [
            { emailAddress: { address: "carol@example.test" } },
          ],
          receivedDateTime: "2026-05-10T12:00:00Z",
          bodyPreview: "Hi there...",
          hasAttachments: true,
          importance: "high",
          isRead: true,
        }),
      ],
    });

    const result = await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { maxResults: 10 },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      messages: [
        {
          id: "msg-1",
          subject: "Hello",
          from: { name: "Alice", address: "alice@example.test" },
          to: [{ name: "Bob", address: "bob@example.test" }],
          cc: [{ name: undefined, address: "carol@example.test" }],
          receivedDateTime: "2026-05-10T12:00:00Z",
          bodyPreview: "Hi there...",
          hasAttachments: true,
          importance: "high",
          isRead: true,
        },
      ],
      count: 1,
    });
  });

  it("returns null for missing Graph optionals (defensive nullability)", async () => {
    mockListMessages.mockResolvedValue({
      value: [
        {
          id: "msg-bare",
          // All other fields omitted.
        },
      ],
    });

    const result = await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { maxResults: 10 },
      triggerEvent: trigger(),
    });

    const projected = (result.output.messages as Array<Record<string, unknown>>)[0]!;
    expect(projected).toEqual({
      id: "msg-bare",
      subject: null,
      from: null,
      to: [],
      cc: [],
      receivedDateTime: null,
      bodyPreview: null,
      hasAttachments: null,
      importance: null,
      isRead: null,
    });
  });

  it("returns empty result set as { messages: [], count: 0 }", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    const result = await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { maxResults: 10 },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({ messages: [], count: 0 });
  });

  it("slices results to maxResults after client-side filtering", async () => {
    // Simulate wrapper's $search-with-3x-headroom path: 12 messages
    // back, handler should slice to maxResults: 4.
    mockListMessages.mockResolvedValue({
      value: Array.from({ length: 12 }, (_, i) =>
        makeGraphMessage({ id: `msg-${i}` }),
      ),
    });

    const result = await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { query: "x", maxResults: 4 },
      triggerEvent: trigger(),
    });

    expect((result.output.messages as Array<unknown>).length).toBe(4);
    expect(result.output.count).toBe(4);
  });
});

describe("fetch_emails action — account routing + Q3", () => {
  it("threads accountId through when trigger came from microsoft-outlook", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { maxResults: 10 },
      triggerEvent: trigger("microsoft-outlook"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        providerAccountId: "alice@contoso.com",
      }),
    );
  });

  it("passes accountId: null when trigger came from a different provider", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { maxResults: 10 },
      triggerEvent: trigger("slack"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        providerAccountId: null,
      }),
    );
  });

  it("wraps the principal call in refreshAndRetry (Q3)", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { maxResults: 10 },
      triggerEvent: trigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
  });

  it("propagates non-401 errors from the wrapper", async () => {
    mockRefreshAndRetry.mockRejectedValue(
      new Error("Microsoft Graph GET me/messages failed: Invalid filter."),
    );

    await expect(
      fetchEmails({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { maxResults: 10 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/Invalid filter/);
  });
});

describe("fetch_emails action — schema enforcement", () => {
  it("applies the schema's default for maxResults", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });

    expect(mockListMessages.mock.calls[0]![0].maxResults).toBe(10);
  });

  it("rejects unknown config fields", async () => {
    await expect(
      fetchEmails({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { extra: "leak", maxResults: 10 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockListMessages).not.toHaveBeenCalled();
  });

  it("rejects maxResults > 50", async () => {
    await expect(
      fetchEmails({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { maxResults: 51 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling fetchEmails.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the fetch_emails config schema (Outlook Mail 2.2 Commit 3).
// V1-shape: all fields optional, maxResults defaults to 10 bounded 1..50,
// strict mode rejects unknowns.
// ---------------------------------------------------------------------------

describe("FetchEmailsConfigSchema", () => {
  it("accepts a fully-empty config (all fields optional)", () => {
    const parsed = FetchEmailsConfigSchema.parse({});
    expect(parsed.maxResults).toBe(10);
    expect(parsed.folderId).toBeUndefined();
    expect(parsed.query).toBeUndefined();
    expect(parsed.startDate).toBeUndefined();
    expect(parsed.endDate).toBeUndefined();
  });

  it("defaults maxResults to 10 when omitted", () => {
    const parsed = FetchEmailsConfigSchema.parse({});
    expect(parsed.maxResults).toBe(10);
  });

  it("accepts a custom folderId", () => {
    const parsed = FetchEmailsConfigSchema.parse({ folderId: "inbox" });
    expect(parsed.folderId).toBe("inbox");
  });

  it("rejects empty-string folderId", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ folderId: "" }),
    ).toThrow();
  });

  it("accepts a query string", () => {
    const parsed = FetchEmailsConfigSchema.parse({ query: "invoice" });
    expect(parsed.query).toBe("invoice");
  });

  it("accepts an empty query string (handler treats as no-query)", () => {
    // Per V1-parity, empty string ≠ undefined at the schema; the
    // handler decides whether to invoke $search or fall to $filter
    // based on `query.trim().length > 0`.
    const parsed = FetchEmailsConfigSchema.parse({ query: "" });
    expect(parsed.query).toBe("");
  });

  it("accepts a startDate string", () => {
    const parsed = FetchEmailsConfigSchema.parse({
      startDate: "2026-05-01T00:00:00Z",
    });
    expect(parsed.startDate).toBe("2026-05-01T00:00:00Z");
  });

  it("accepts an endDate string", () => {
    const parsed = FetchEmailsConfigSchema.parse({
      endDate: "2026-05-31T23:59:59Z",
    });
    expect(parsed.endDate).toBe("2026-05-31T23:59:59Z");
  });

  it("rejects empty-string startDate", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ startDate: "" }),
    ).toThrow();
  });

  it("rejects empty-string endDate", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ endDate: "" }),
    ).toThrow();
  });

  it("accepts maxResults at the lower bound (1)", () => {
    const parsed = FetchEmailsConfigSchema.parse({ maxResults: 1 });
    expect(parsed.maxResults).toBe(1);
  });

  it("accepts maxResults at the upper bound (50)", () => {
    const parsed = FetchEmailsConfigSchema.parse({ maxResults: 50 });
    expect(parsed.maxResults).toBe(50);
  });

  it("rejects maxResults = 0", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: 0 }),
    ).toThrow();
  });

  it("rejects maxResults > 50", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: 51 }),
    ).toThrow();
  });

  it("rejects negative maxResults", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: -1 }),
    ).toThrow();
  });

  it("rejects non-integer maxResults", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: 10.5 }),
    ).toThrow();
  });

  it("rejects string maxResults (no coercion)", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: "10" }),
    ).toThrow();
  });

  it("accepts a fully-populated config", () => {
    const parsed = FetchEmailsConfigSchema.parse({
      folderId: "inbox",
      query: "invoice",
      startDate: "2026-05-01T00:00:00Z",
      endDate: "2026-05-31T23:59:59Z",
      maxResults: 25,
    });
    expect(parsed).toEqual({
      folderId: "inbox",
      query: "invoice",
      startDate: "2026-05-01T00:00:00Z",
      endDate: "2026-05-31T23:59:59Z",
      maxResults: 25,
    });
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ unknownExtra: "leak" }),
    ).toThrow();
  });
});
