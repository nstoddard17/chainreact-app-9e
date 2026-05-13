/**
 * @jest-environment node
 *
 * Tests for the Gmail searchEmails action handler.
 *
 * Two API calls per invocation: usersMessagesList (single page) then
 * usersMessagesGet per id (fail-fast). Both mocked at the API
 * boundary. refreshAndRetry is mocked to forward `apiCall("token")`
 * so the closure shape is exercised.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { UsersMessagesGetResult } from "@/integrations/gmail/api/usersMessagesGet";

const mockRefreshAndRetry = jest.fn();
const mockUsersMessagesList = jest.fn();
const mockUsersMessagesGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {
    constructor(message?: string) {
      super(message);
      this.name = "Unauthorized401Error";
    }
  },
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersMessagesList", () => ({
  usersMessagesList: (...args: unknown[]) => mockUsersMessagesList(...args),
}));

jest.mock("@/integrations/gmail/api/usersMessagesGet", () => ({
  usersMessagesGet: (...args: unknown[]) => mockUsersMessagesGet(...args),
}));

import { searchEmails } from "@/integrations/gmail/actions/searchEmails";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersMessagesList.mockReset();
  mockUsersMessagesGet.mockReset();
});

function makeGmailTriggerEvent(): TriggerEvent {
  return {
    provider: "gmail",
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-12T12:00:00Z",
    accountId: "me@example.com",
    payload: {},
  };
}

function baseHandlerInput(overrides: {
  config?: Record<string, unknown>;
} = {}) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-1",
    nodeId: "node-search-emails",
    config: overrides.config ?? {
      searchMode: "query",
      query: "is:unread",
    },
    triggerEvent: makeGmailTriggerEvent(),
  };
}

function wireRefreshAndRetry() {
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) => {
      return await input.apiCall("token");
    },
  );
}

function makeMessage(
  overrides: { id?: string; threadId?: string; headers?: ReadonlyArray<{ name: string; value: string }>; snippet?: string; labelIds?: readonly string[]; internalDate?: string } = {},
): UsersMessagesGetResult {
  return {
    id: overrides.id ?? "msg-1",
    threadId: overrides.threadId ?? "thr-1",
    labelIds: overrides.labelIds ?? ["INBOX", "UNREAD"],
    snippet: overrides.snippet ?? "snippet text",
    internalDate: overrides.internalDate ?? "1700000000000",
    sizeEstimate: 1024,
    payload: {
      mimeType: "text/plain",
      headers: overrides.headers ?? [
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "me@example.com" },
        { name: "Subject", value: "Hello" },
        { name: "Date", value: "Mon, 12 May 2026 12:00:00 +0000" },
      ],
    },
  };
}

describe("searchEmails — query mode", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
  });

  it("calls usersMessagesList with raw q verbatim (no mutation)", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [],
      resultSizeEstimate: 0,
    });

    await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "query",
          query: 'from:alice@example.com subject:"hello world"',
        },
      }),
    );

    expect(mockUsersMessagesList).toHaveBeenCalledTimes(1);
    const args = mockUsersMessagesList.mock.calls[0]![0];
    expect(args.q).toBe('from:alice@example.com subject:"hello world"');
  });

  it("forwards maxResults + pageToken when provided", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [],
      resultSizeEstimate: 0,
    });

    await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "query",
          query: "is:unread",
          maxResults: 25,
          pageToken: "next-abc",
        },
      }),
    );

    const args = mockUsersMessagesList.mock.calls[0]![0];
    expect(args.maxResults).toBe(25);
    expect(args.pageToken).toBe("next-abc");
  });
});

describe("searchEmails — filters mode (q-builder integration)", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
    mockUsersMessagesList.mockResolvedValue({
      messages: [],
      resultSizeEstimate: 0,
    });
  });

  it("composes q from from/to/subject", async () => {
    await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "filters",
          from: "alice@example.com",
          to: "bob@example.com",
          subject: "Hi",
        },
      }),
    );

    const args = mockUsersMessagesList.mock.calls[0]![0];
    expect(args.q).toBe(
      "from:alice@example.com to:bob@example.com subject:Hi",
    );
  });

  it("composes q with hasAttachment yes / no", async () => {
    await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "filters",
          hasAttachment: "yes",
        },
      }),
    );
    expect(mockUsersMessagesList.mock.calls[0]![0].q).toBe("has:attachment");

    mockUsersMessagesList.mockClear();
    await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "filters",
          hasAttachment: "no",
        },
      }),
    );
    expect(mockUsersMessagesList.mock.calls[0]![0].q).toBe("-has:attachment");
  });

  it("composes q with date range (dateAfter + dateBefore)", async () => {
    await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "filters",
          dateAfter: "2026/01/01",
          dateBefore: "2026/06/30",
        },
      }),
    );

    expect(mockUsersMessagesList.mock.calls[0]![0].q).toBe(
      "after:2026/01/01 before:2026/06/30",
    );
  });

  it("composes q with size filters (largerThan + smallerThan)", async () => {
    await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "filters",
          largerThan: 1_000_000,
          smallerThan: 5_000_000,
        },
      }),
    );

    expect(mockUsersMessagesList.mock.calls[0]![0].q).toBe(
      "larger:1000000 smaller:5000000",
    );
  });

  it("composes q with labelIds (each as label:<id>)", async () => {
    await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "filters",
          labelIds: ["INBOX", "Label_5"],
        },
      }),
    );

    expect(mockUsersMessagesList.mock.calls[0]![0].q).toBe(
      "label:INBOX label:Label_5",
    );
  });

  it("composes q with hasWords + doesntHaveWords", async () => {
    await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "filters",
          hasWords: "urgent priority",
          doesntHaveWords: "newsletter",
        },
      }),
    );

    expect(mockUsersMessagesList.mock.calls[0]![0].q).toBe(
      "urgent priority -(newsletter)",
    );
  });
});

describe("searchEmails — hydration", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
  });

  it("hydrates every returned id via usersMessagesGet (sequential)", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [
        { id: "msg-1", threadId: "thr-1" },
        { id: "msg-2", threadId: "thr-2" },
      ],
      resultSizeEstimate: 2,
    });
    mockUsersMessagesGet
      .mockResolvedValueOnce(makeMessage({ id: "msg-1" }))
      .mockResolvedValueOnce(makeMessage({ id: "msg-2" }));

    await searchEmails(baseHandlerInput());

    expect(mockUsersMessagesGet).toHaveBeenCalledTimes(2);
    expect(mockUsersMessagesGet.mock.calls[0]![0].messageId).toBe("msg-1");
    expect(mockUsersMessagesGet.mock.calls[1]![0].messageId).toBe("msg-2");
  });

  it("projects each hydrated message into stable output metadata", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [{ id: "msg-1", threadId: "thr-1" }],
      resultSizeEstimate: 1,
    });
    mockUsersMessagesGet.mockResolvedValueOnce(
      makeMessage({
        id: "msg-1",
        threadId: "thr-1",
        snippet: "hello world",
        labelIds: ["INBOX", "Label_5"],
        internalDate: "1700000000000",
        headers: [
          { name: "From", value: "Alice <alice@example.com>" },
          { name: "To", value: "me@example.com" },
          { name: "Subject", value: "Hi" },
          { name: "Date", value: "Mon, 12 May 2026 12:00:00 +0000" },
        ],
      }),
    );

    const result = await searchEmails(baseHandlerInput());

    expect(result.output.messages).toEqual([
      {
        messageId: "msg-1",
        threadId: "thr-1",
        subject: "Hi",
        from: "Alice <alice@example.com>",
        to: "me@example.com",
        date: "Mon, 12 May 2026 12:00:00 +0000",
        snippet: "hello world",
        labelIds: ["INBOX", "Label_5"],
        internalDate: "1700000000000",
      },
    ]);
  });

  it("FAILS FAST on hydration error — does not swallow / continue", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [
        { id: "msg-1", threadId: "thr-1" },
        { id: "msg-2", threadId: "thr-2" },
        { id: "msg-3", threadId: "thr-3" },
      ],
      resultSizeEstimate: 3,
    });
    mockUsersMessagesGet
      .mockResolvedValueOnce(makeMessage({ id: "msg-1" }))
      .mockRejectedValueOnce(
        new Error("Gmail messages.get failed: Not Found"),
      );

    await expect(searchEmails(baseHandlerInput())).rejects.toThrow(
      /Not Found/,
    );
    // Only msg-1 + msg-2 attempts; loop aborted on msg-2's rejection
    expect(mockUsersMessagesGet).toHaveBeenCalledTimes(2);
  });
});

describe("searchEmails — output shape", () => {
  beforeEach(() => {
    wireRefreshAndRetry();
  });

  it("returns { query, messages, count, nextPageToken, resultSizeEstimate, hasMore }", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [{ id: "msg-1", threadId: "thr-1" }],
      nextPageToken: "next-token",
      resultSizeEstimate: 42,
    });
    mockUsersMessagesGet.mockResolvedValueOnce(makeMessage({ id: "msg-1" }));

    const result = await searchEmails(baseHandlerInput());

    expect(result.output).toEqual(
      expect.objectContaining({
        query: "is:unread",
        count: 1,
        nextPageToken: "next-token",
        resultSizeEstimate: 42,
        hasMore: true,
      }),
    );
    expect(result.output.messages).toHaveLength(1);
  });

  it("returns hasMore=false and undefined nextPageToken when there are no more pages", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [{ id: "msg-1", threadId: "thr-1" }],
      resultSizeEstimate: 1,
      // no nextPageToken
    });
    mockUsersMessagesGet.mockResolvedValueOnce(makeMessage({ id: "msg-1" }));

    const result = await searchEmails(baseHandlerInput());

    expect(result.output.hasMore).toBe(false);
    expect(result.output.nextPageToken).toBeUndefined();
  });

  it("returns empty messages + count 0 when there are no results", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [],
      resultSizeEstimate: 0,
    });

    const result = await searchEmails(baseHandlerInput());

    expect(result.output.messages).toEqual([]);
    expect(result.output.count).toBe(0);
    expect(result.output.hasMore).toBe(false);
    expect(mockUsersMessagesGet).not.toHaveBeenCalled();
  });

  it("output.query echoes the raw query in query mode", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [],
      resultSizeEstimate: 0,
    });

    const result = await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "query",
          query: "from:alice@example.com OR from:bob@example.com",
        },
      }),
    );

    expect(result.output.query).toBe(
      "from:alice@example.com OR from:bob@example.com",
    );
  });

  it("output.query echoes the BUILT query in filters mode (for debugging)", async () => {
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [],
      resultSizeEstimate: 0,
    });

    const result = await searchEmails(
      baseHandlerInput({
        config: {
          searchMode: "filters",
          from: "alice@example.com",
          hasAttachment: "yes",
        },
      }),
    );

    expect(result.output.query).toBe(
      "from:alice@example.com has:attachment",
    );
  });
});

describe("searchEmails — error propagation", () => {
  it("throws ZodError when searchMode is missing", async () => {
    await expect(
      searchEmails(
        baseHandlerInput({
          config: { query: "is:unread" },
        }),
      ),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("propagates usersMessagesList failure (no hydration attempted)", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesList.mockRejectedValueOnce(
      new Error("Gmail messages.list failed: Invalid query syntax."),
    );

    await expect(searchEmails(baseHandlerInput())).rejects.toThrow(
      /Invalid query syntax/,
    );
    expect(mockUsersMessagesGet).not.toHaveBeenCalled();
  });
});

describe("searchEmails — refreshAndRetry routing", () => {
  it("routes both list + get calls through refreshAndRetry with Gmail accountId", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [{ id: "msg-1", threadId: "thr-1" }],
      resultSizeEstimate: 1,
    });
    mockUsersMessagesGet.mockResolvedValueOnce(makeMessage());

    await searchEmails(baseHandlerInput());

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0].provider).toBe("gmail");
      expect(call[0].accountId).toBe("me@example.com");
    }
  });

  it("passes accountId: null for non-Gmail trigger events", async () => {
    wireRefreshAndRetry();
    mockUsersMessagesList.mockResolvedValueOnce({
      messages: [],
      resultSizeEstimate: 0,
    });

    await searchEmails({
      workflowId: "wf-1",
      userId: "user-1",
      runId: "run-1",
      nodeId: "node-search",
      config: { searchMode: "query", query: "is:unread" },
      triggerEvent: {
        provider: "slack",
        eventType: "msg",
        eventId: "e",
        occurredAt: "2026-05-12T12:00:00Z",
        accountId: "T1",
        payload: {},
      },
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBeNull();
  });
});
