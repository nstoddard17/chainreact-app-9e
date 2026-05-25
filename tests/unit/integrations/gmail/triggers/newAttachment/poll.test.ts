/**
 * @jest-environment node
 *
 * End-to-end behavior tests for the Gmail new_attachment poll handler.
 *
 * Mocks the I/O dependencies (history.list, messages.get, dedup repo,
 * integrations repo, enqueueRun) and exercises the full per-tick flow.
 * Pins the contract from Gmail 2.3 plan §6:
 *
 *   - messagesAdded events with attachments → fire (enqueueRun called).
 *   - messagesAdded events WITHOUT attachments → DO NOT fire.
 *   - labelsAdded events → ignored (not a "new attachment" event).
 *   - defensive `messages` events → ignored.
 *   - Mixed history pages emit ONLY the attachment-bearing
 *     messagesAdded events.
 *   - The hydrate call uses `format: "full"` (needed for payload.parts).
 *   - Cross-tick dedup wraps each message via `attachment:<id>` key.
 */

const mockRefreshAndRetry = jest.fn();
const mockUsersHistoryList = jest.fn();
const mockUsersMessagesGet = jest.fn();
const mockUsersGetProfile = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();
const mockEnqueueRun = jest.fn();
const mockMarkSeen = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersHistoryList", () => ({
  usersHistoryList: (...args: unknown[]) => mockUsersHistoryList(...args),
  HistoryListStaleCursorError: class extends Error {},
}));

jest.mock("@/integrations/gmail/api/usersMessagesGet", () => ({
  usersMessagesGet: (...args: unknown[]) => mockUsersMessagesGet(...args),
}));

jest.mock("@/integrations/gmail/api/usersGetProfile", () => ({
  usersGetProfile: (...args: unknown[]) => mockUsersGetProfile(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueueRun(...args),
}));

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

import { gmailNewAttachmentPollingHandler } from "@/integrations/gmail/triggers/newAttachment/poll";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersHistoryList.mockReset();
  mockUsersMessagesGet.mockReset();
  mockUsersGetProfile.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockEnqueueRun.mockReset();
  mockMarkSeen.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});

  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) =>
      i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "gmail",
    providerAccountId: "alice@example.com",
  });
  mockMarkSeen.mockResolvedValue({ fresh: true });
  mockUpdateConfig.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "gmail",
  eventType: "new_attachment",
  nodeId: "n1",
  config: {
    pollingEnabled: true,
    snapshot: { historyId: "100", capturedAt: "2026-05-14T12:00:00Z" },
  },
  accountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
} as const;

function messageWithAttachment(id: string) {
  return {
    id,
    threadId: `thr-${id}`,
    labelIds: ["INBOX"],
    snippet: "",
    internalDate: "0",
    sizeEstimate: 4096,
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "alice@example.com" },
        { name: "Subject", value: "Doc attached" },
      ],
      parts: [
        {
          mimeType: "application/pdf",
          filename: "report.pdf",
          body: { attachmentId: `att-${id}`, size: 2048 },
        },
      ],
    },
  };
}

function messageWithoutAttachment(id: string) {
  return {
    id,
    threadId: `thr-${id}`,
    labelIds: ["INBOX"],
    snippet: "",
    internalDate: "0",
    sizeEstimate: 1024,
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "From", value: "bob@example.com" }],
      parts: undefined,
    },
  };
}

describe("Gmail new_attachment poll — fire / skip behavior", () => {
  it("fires (enqueueRun called) when a messagesAdded message has an attachment", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-A" } }] }],
    });
    mockUsersMessagesGet.mockResolvedValueOnce(messageWithAttachment("msg-A"));

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const arg = mockEnqueueRun.mock.calls[0]![0];
    expect(arg.workflowId).toBe("wf-1");
    expect(arg.event.eventType).toBe("new_attachment");
    expect(arg.event.eventId).toBe("attachment:msg-A");
    expect(arg.event.payload.attachmentCount).toBe(1);
  });

  it("does NOT fire when a messagesAdded message has no attachments", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-B" } }] }],
    });
    mockUsersMessagesGet.mockResolvedValueOnce(messageWithoutAttachment("msg-B"));

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("ignores labelsAdded events (does not hydrate or fire)", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [
        {
          id: "h1",
          labelsAdded: [
            {
              message: { id: "msg-L" },
              labelIds: ["Label_5"],
            },
          ],
        },
      ],
    });

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockUsersMessagesGet).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("ignores defensive `messages` events (does not hydrate or fire)", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messages: [{ id: "msg-D" }] }],
    });

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockUsersMessagesGet).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("mixed history page → emits only attachment-bearing messagesAdded events", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [
        {
          id: "h1",
          messagesAdded: [
            { message: { id: "with-att" } },
            { message: { id: "no-att" } },
          ],
          labelsAdded: [
            { message: { id: "labeled" }, labelIds: ["Label_5"] },
          ],
          messages: [{ id: "defensive" }],
        },
      ],
    });
    // Map message id → response. The first one has an attachment;
    // the second does not. The labelsAdded / defensive ids should
    // never be hydrated.
    mockUsersMessagesGet.mockImplementation(
      async (i: { messageId: string }) => {
        if (i.messageId === "with-att") return messageWithAttachment("with-att");
        if (i.messageId === "no-att") return messageWithoutAttachment("no-att");
        throw new Error(`Unexpected hydrate for ${i.messageId}`);
      },
    );

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      userRole: "owner",
      now: Date.now(),
    });

    const hydrated = mockUsersMessagesGet.mock.calls.map(
      (c) => (c[0] as { messageId: string }).messageId,
    );
    expect(hydrated.sort()).toEqual(["no-att", "with-att"].sort());
    expect(mockUsersMessagesGet).toHaveBeenCalledTimes(2);

    expect(mockEnqueueRun).toHaveBeenCalledTimes(1);
    const arg = mockEnqueueRun.mock.calls[0]![0];
    expect(arg.event.eventId).toBe("attachment:with-att");
  });
});

describe("Gmail new_attachment poll — wiring details", () => {
  it("hydrates with `format: \"full\"` (required for payload.parts)", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-A" } }] }],
    });
    mockUsersMessagesGet.mockResolvedValueOnce(messageWithAttachment("msg-A"));

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      userRole: "owner",
      now: Date.now(),
    });

    const arg = mockUsersMessagesGet.mock.calls[0]![0];
    expect(arg.format).toBe("full");
    expect(arg.messageId).toBe("msg-A");
  });

  it("dedup wraps each hydrated message with the `attachment:` prefix", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-A" } }] }],
    });
    mockUsersMessagesGet.mockResolvedValueOnce(messageWithAttachment("msg-A"));

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockMarkSeen).toHaveBeenCalledWith("gmail", "attachment:msg-A");
  });

  it("dedup miss (fresh=false) short-circuits hydration", async () => {
    mockUsersHistoryList.mockResolvedValueOnce({
      historyId: "200",
      history: [{ id: "h1", messagesAdded: [{ message: { id: "msg-A" } }] }],
    });
    mockMarkSeen.mockReset();
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });

    await gmailNewAttachmentPollingHandler.poll({
      trigger: baseTrigger,
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockUsersMessagesGet).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });

  it("canHandle is provider+eventType-scoped", () => {
    expect(
      gmailNewAttachmentPollingHandler.canHandle(baseTrigger),
    ).toBe(true);
    expect(
      gmailNewAttachmentPollingHandler.canHandle({
        ...baseTrigger,
        eventType: "new_email",
      }),
    ).toBe(false);
    expect(
      gmailNewAttachmentPollingHandler.canHandle({
        ...baseTrigger,
        provider: "microsoft-outlook",
      }),
    ).toBe(false);
  });

  it("does nothing when snapshot is missing (defensive log + return)", async () => {
    await gmailNewAttachmentPollingHandler.poll({
      trigger: { ...baseTrigger, config: { pollingEnabled: true } },
      userRole: "owner",
      now: Date.now(),
    });

    expect(mockUsersHistoryList).not.toHaveBeenCalled();
    expect(mockEnqueueRun).not.toHaveBeenCalled();
  });
});
