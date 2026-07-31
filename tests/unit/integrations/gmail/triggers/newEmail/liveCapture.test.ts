/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-4 §1 — the Gmail `new_email` live-capture adapter.
 *
 * The adapter is the session-scoped stand-in for the production trigger, so the properties under
 * test are the §6 contract guarantees:
 *   - baseline-first: only mail past the listening baseline is ever captured;
 *   - the captured payload is the CANONICAL TriggerEvent the production trigger would emit
 *     (validated against the contract schema, byte-identical hydration);
 *   - the preview is sender/subject/received-time ONLY;
 *   - non-matching mail is inspected and ignored — never consumed, never recorded;
 *   - NO production state is touched: no dedup insert, no trigger_resources write;
 *   - a swapped mailbox or stale cursor degrades to `waiting`, never to a wrong capture.
 */

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: async ({ apiCall }: { apiCall: (token: string) => Promise<unknown> }) =>
    apiCall("test-access-token"),
}));
const mockGetActive = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
}));
const mockHistoryList = jest.fn();
jest.mock("@/integrations/gmail/api/usersHistoryList", () => {
  class HistoryListStaleCursorError extends Error {}
  return {
    usersHistoryList: (...a: unknown[]) => mockHistoryList(...a),
    HistoryListStaleCursorError,
  };
});
const mockGetProfile = jest.fn();
jest.mock("@/integrations/gmail/api/usersGetProfile", () => ({
  usersGetProfile: (...a: unknown[]) => mockGetProfile(...a),
}));
const mockMessagesGet = jest.fn();
jest.mock("@/integrations/gmail/api/usersMessagesGet", () => ({
  usersMessagesGet: (...a: unknown[]) => mockMessagesGet(...a),
}));
// PRODUCTION-STATE GUARDS — the adapter must never import/consume these. The mocks exist so
// that if a future edit wires them in, these assertions fail instead of silently spending
// production dedup slots or advancing the real trigger cursor.
const mockCheckAndMarkSeen = jest.fn();
jest.mock("@/integrations/gmail/triggers/newEmail/dedup", () => ({
  checkAndMarkSeen: (...a: unknown[]) => mockCheckAndMarkSeen(...a),
}));
const mockUpdateTriggerConfig = jest.fn();
jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...a: unknown[]) => mockUpdateTriggerConfig(...a),
}));

import { TriggerEventSchema } from "@/contracts/triggerEvent";
import { HistoryListStaleCursorError } from "@/integrations/gmail/api/usersHistoryList";
import { gmailNewEmailLiveCaptureAdapter } from "@/integrations/gmail/triggers/newEmail/liveCapture";

const CONTEXT = {
  accountId: "acct-1",
  workflowId: "wf-1",
  sessionId: "sess-1",
  triggerConfig: {},
};

const BASELINE = {
  historyId: "1000",
  providerAccountId: "owner@example.com",
  capturedAt: "2026-08-01T10:00:00.000Z",
};

function gmailMessage(overrides: Partial<{
  id: string;
  subject: string;
  from: string;
  labelIds: string[];
  mimeType: string;
}> = {}) {
  const id = overrides.id ?? "msg-1";
  return {
    id,
    threadId: `thread-${id}`,
    labelIds: overrides.labelIds ?? ["INBOX"],
    snippet: "snippet",
    sizeEstimate: 1234,
    internalDate: "1754042400000",
    payload: {
      mimeType: overrides.mimeType ?? "multipart/alternative",
      headers: [
        { name: "From", value: overrides.from ?? "Sender <sender@example.com>" },
        { name: "To", value: "owner@example.com" },
        { name: "Subject", value: overrides.subject ?? "Hello" },
        { name: "Date", value: "Fri, 01 Aug 2026 10:00:00 +0000" },
        { name: "Message-ID", value: `<${id}@mail>` },
      ],
    },
  };
}

function historyPage(ids: string[], historyId: string, nextPageToken?: string) {
  return {
    historyId,
    history: ids.map((id) => ({ messagesAdded: [{ message: { id } }] })),
    ...(nextPageToken ? { nextPageToken } : {}),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActive.mockResolvedValue({ id: "int-1", providerAccountId: "owner@example.com" });
});

describe("establishBaseline", () => {
  it("pins the mailbox and its current historyId — only future mail is capturable", async () => {
    mockGetProfile.mockResolvedValue({ emailAddress: "owner@example.com", historyId: "1000" });
    const baseline = await gmailNewEmailLiveCaptureAdapter.establishBaseline(CONTEXT);
    expect(baseline).toMatchObject({
      historyId: "1000",
      providerAccountId: "owner@example.com",
    });
  });

  it("throws when no active Gmail connection exists (start maps it to a typed retryable)", async () => {
    mockGetActive.mockResolvedValue(null);
    await expect(gmailNewEmailLiveCaptureAdapter.establishBaseline(CONTEXT)).rejects.toThrow(
      /no active gmail connection/i,
    );
  });
});

describe("captureNext", () => {
  it("returns waiting when nothing new arrived past the baseline", async () => {
    mockHistoryList.mockResolvedValue(historyPage([], "1000"));
    const result = await gmailNewEmailLiveCaptureAdapter.captureNext(CONTEXT, BASELINE);
    expect(result).toEqual({ status: "waiting" });
    expect(mockMessagesGet).not.toHaveBeenCalled();
  });

  it("captures the FIRST matching arrival as the canonical production TriggerEvent", async () => {
    mockHistoryList.mockResolvedValue(historyPage(["msg-1"], "1010"));
    mockMessagesGet.mockResolvedValue(gmailMessage({ id: "msg-1", subject: "Order received" }));

    const result = await gmailNewEmailLiveCaptureAdapter.captureNext(CONTEXT, BASELINE);
    if (result.status !== "captured") throw new Error("expected capture");

    // Canonical contract — the exact shape an activated trigger would emit.
    const parsed = TriggerEventSchema.parse(result.payload);
    expect(parsed).toMatchObject({
      provider: "gmail",
      eventType: "new_email",
      eventId: "msg-1",
      providerAccountId: "owner@example.com",
    });
    expect(parsed.payload).toMatchObject({
      id: "msg-1",
      subject: "Order received",
      from: "Sender <sender@example.com>",
    });

    // Safe preview: sender/subject/received time ONLY — no ids, snippet, or recipients.
    expect(Object.keys(result.preview).sort()).toEqual(["from", "receivedAt", "subject"]);

    // Baseline advanced past the walked history so the event can't be re-captured.
    expect(result.baseline).toMatchObject({
      historyId: "1010",
      providerAccountId: "owner@example.com",
    });
  });

  it("applies the node's saved filters — non-matching mail is ignored, later matches capture", async () => {
    const context = {
      ...CONTEXT,
      triggerConfig: { subject: "invoice", subjectExactMatch: false },
    };
    mockHistoryList.mockResolvedValue(historyPage(["msg-1", "msg-2"], "1020"));
    mockMessagesGet
      .mockResolvedValueOnce(gmailMessage({ id: "msg-1", subject: "Newsletter" }))
      .mockResolvedValueOnce(gmailMessage({ id: "msg-2", subject: "Your invoice is ready" }));

    const result = await gmailNewEmailLiveCaptureAdapter.captureNext(context, BASELINE);
    if (result.status !== "captured") throw new Error("expected capture");
    expect(result.payload.eventId).toBe("msg-2");
  });

  it("returns waiting (not a wrong capture) when only non-matching mail arrived", async () => {
    const context = { ...CONTEXT, triggerConfig: { from: ["boss@example.com"] } };
    mockHistoryList.mockResolvedValue(historyPage(["msg-1"], "1020"));
    mockMessagesGet.mockResolvedValue(gmailMessage({ id: "msg-1" }));
    expect(await gmailNewEmailLiveCaptureAdapter.captureNext(context, BASELINE)).toEqual({
      status: "waiting",
    });
  });

  it("walks pagination and captures across pages", async () => {
    mockHistoryList
      .mockResolvedValueOnce(historyPage(["msg-1"], "1010", "page-2"))
      .mockResolvedValueOnce(historyPage(["msg-2"], "1020"));
    mockMessagesGet
      .mockResolvedValueOnce(gmailMessage({ id: "msg-1", labelIds: ["SPAM"] })) // fails INBOX default
      .mockResolvedValueOnce(gmailMessage({ id: "msg-2" }));
    const result = await gmailNewEmailLiveCaptureAdapter.captureNext(CONTEXT, BASELINE);
    if (result.status !== "captured") throw new Error("expected capture");
    expect(result.payload.eventId).toBe("msg-2");
    expect(result.baseline).toMatchObject({ historyId: "1020" });
  });

  it("one unreadable message never aborts the attempt — the next candidate still captures", async () => {
    mockHistoryList.mockResolvedValue(historyPage(["msg-1", "msg-2"], "1030"));
    mockMessagesGet
      .mockRejectedValueOnce(new Error("message deleted"))
      .mockResolvedValueOnce(gmailMessage({ id: "msg-2" }));
    const result = await gmailNewEmailLiveCaptureAdapter.captureNext(CONTEXT, BASELINE);
    expect(result.status).toBe("captured");
  });

  it("refuses to capture from a DIFFERENT mailbox than listening started on", async () => {
    mockGetActive.mockResolvedValue({ id: "int-2", providerAccountId: "other@example.com" });
    const result = await gmailNewEmailLiveCaptureAdapter.captureNext(CONTEXT, BASELINE);
    expect(result).toEqual({ status: "waiting" });
    expect(mockHistoryList).not.toHaveBeenCalled();
  });

  it("a stale baseline cursor degrades to waiting — the session TTL bounds it honestly", async () => {
    mockHistoryList.mockRejectedValue(new HistoryListStaleCursorError("stale"));
    expect(await gmailNewEmailLiveCaptureAdapter.captureNext(CONTEXT, BASELINE)).toEqual({
      status: "waiting",
    });
  });

  it("touches NO production trigger state: no dedup consume, no trigger_resources write", async () => {
    mockHistoryList.mockResolvedValue(historyPage(["msg-1"], "1010"));
    mockMessagesGet.mockResolvedValue(gmailMessage({ id: "msg-1" }));
    const result = await gmailNewEmailLiveCaptureAdapter.captureNext(CONTEXT, BASELINE);
    expect(result.status).toBe("captured");
    expect(mockCheckAndMarkSeen).not.toHaveBeenCalled();
    expect(mockUpdateTriggerConfig).not.toHaveBeenCalled();
  });
});
