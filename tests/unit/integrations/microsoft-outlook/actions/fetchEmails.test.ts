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
    accountId: "alice@contoso.com",
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
      runId: "r",
      nodeId: "n",
      config: { maxResults: 10 },
      triggerEvent: trigger("microsoft-outlook"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        accountId: "alice@contoso.com",
      }),
    );
  });

  it("passes accountId: null when trigger came from a different provider", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { maxResults: 10 },
      triggerEvent: trigger("slack"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        accountId: null,
      }),
    );
  });

  it("wraps the principal call in refreshAndRetry (Q3)", async () => {
    mockListMessages.mockResolvedValue({ value: [] });

    await fetchEmails({
      workflowId: "wf",
      userId: "u",
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
        runId: "r",
        nodeId: "n",
        config: { maxResults: 51 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
