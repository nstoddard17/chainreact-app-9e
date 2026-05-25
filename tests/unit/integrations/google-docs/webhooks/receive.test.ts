/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-5 — receive route tests.
 */
const mockListByConfigContains = jest.fn();
const mockVerifyChannelToken = jest.fn();
const mockNewDocumentPull = jest.fn();
const mockDocumentUpdatedPull = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) => mockListByConfigContains(...args),
}));

jest.mock("@/integrations/_shared/google/channelToken", () => ({
  verifyChannelToken: (...args: unknown[]) => mockVerifyChannelToken(...args),
}));

jest.mock("@/integrations/google-docs/triggers/newDocument/pull", () => ({
  pull: (...args: unknown[]) => mockNewDocumentPull(...args),
}));

jest.mock(
  "@/integrations/google-docs/triggers/documentUpdated/pull",
  () => ({
    pull: (...args: unknown[]) => mockDocumentUpdatedPull(...args),
  }),
);

import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveDocsWebhook } from "@/integrations/google-docs/webhooks/receive";

beforeEach(() => {
  mockListByConfigContains.mockReset();
  mockVerifyChannelToken.mockReset();
  mockNewDocumentPull.mockReset();
  mockDocumentUpdatedPull.mockReset();
});

function makeRequest(headers: Record<string, string>): Request {
  return new Request("https://app.example.test/api/webhooks/google-docs", {
    method: "POST",
    headers,
  });
}

const newDocTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "google-docs",
  eventType: "new_document",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    channelId: "channel-new",
    fileId: "root",
    pageToken: "p",
  },
  accountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

const updatedTrigger = {
  ...newDocTrigger,
  id: "tr-2",
  eventType: "document_updated",
  config: {
    type: "subscription-watch",
    channelId: "channel-upd",
    fileId: "fld-A",
    folderId: "fld-A",
    pageToken: "p",
  },
};

describe("receiveDocsWebhook — header verification", () => {
  it("throws InvalidSignatureError when channel headers are missing", async () => {
    await expect(receiveDocsWebhook(makeRequest({}))).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });

  it("returns unknown_channel when no trigger matches the channelId (silent ack)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([]);
    const result = await receiveDocsWebhook(
      makeRequest({
        "x-goog-channel-id": "unknown",
        "x-goog-channel-token": "any",
      }),
    );
    expect(result.kind).toBe("unknown_channel");
    expect(mockVerifyChannelToken).not.toHaveBeenCalled();
  });

  it("throws InvalidSignatureError on channel token mismatch (spoof)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([newDocTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(false);
    await expect(
      receiveDocsWebhook(
        makeRequest({
          "x-goog-channel-id": "channel-new",
          "x-goog-channel-token": "tampered",
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
    expect(mockNewDocumentPull).not.toHaveBeenCalled();
    expect(mockDocumentUpdatedPull).not.toHaveBeenCalled();
  });

  it("returns handshake on resource_state=sync (no pull)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([newDocTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(true);
    const result = await receiveDocsWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-new",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "sync",
      }),
    );
    expect(result.kind).toBe("handshake");
    expect(mockNewDocumentPull).not.toHaveBeenCalled();
    expect(mockDocumentUpdatedPull).not.toHaveBeenCalled();
  });
});

describe("receiveDocsWebhook — event-type dispatch (no cross-talk)", () => {
  it("dispatches new_document trigger to the new_document pull", async () => {
    mockListByConfigContains.mockResolvedValueOnce([newDocTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(true);
    mockNewDocumentPull.mockResolvedValueOnce({
      events: [
        {
          provider: "google-docs",
          eventType: "new_document",
          eventId: "doc-1:2026-05-08T10:00:00Z",
          occurredAt: "2026-05-08T10:00:00Z",
          accountId: "alice@example.com",
          payload: {
            documentId: "doc-1",
            title: "Hi",
            documentUrl: "https://docs.google.com/document/d/doc-1/edit",
            folderId: null,
            createdAt: "2026-05-08T10:00:00Z",
            createdBy: "alice@example.com",
            mimeType: "application/vnd.google-apps.document",
            changeKind: "created",
          },
        },
      ],
      resyncRequired: false,
    });

    const result = await receiveDocsWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-new",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "add",
      }),
    );

    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.eventType).toBe("new_document");
    }
    expect(mockNewDocumentPull).toHaveBeenCalledWith(newDocTrigger);
    expect(mockDocumentUpdatedPull).not.toHaveBeenCalled();
  });

  it("dispatches document_updated trigger to the document_updated pull", async () => {
    mockListByConfigContains.mockResolvedValueOnce([updatedTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(true);
    mockDocumentUpdatedPull.mockResolvedValueOnce({
      events: [
        {
          provider: "google-docs",
          eventType: "document_updated",
          eventId: "doc-1:2026-05-08T11:00:00Z",
          occurredAt: "2026-05-08T11:00:00Z",
          accountId: "alice@example.com",
          payload: {
            documentId: "doc-1",
            title: "Hi",
            documentUrl: "https://docs.google.com/document/d/doc-1/edit",
            folderId: "fld-A",
            updatedAt: "2026-05-08T11:00:00Z",
            updatedBy: "bob@example.com",
            revisionId: "42",
            mimeType: "application/vnd.google-apps.document",
            changeKind: "updated",
          },
        },
      ],
      resyncRequired: false,
    });

    const result = await receiveDocsWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-upd",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "update",
      }),
    );

    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.eventType).toBe("document_updated");
    }
    expect(mockDocumentUpdatedPull).toHaveBeenCalledWith(updatedTrigger);
    expect(mockNewDocumentPull).not.toHaveBeenCalled();
  });

  it("logs + acks unknown event type without dispatching", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockListByConfigContains.mockResolvedValueOnce([
      { ...newDocTrigger, eventType: "future_trigger" },
    ]);
    mockVerifyChannelToken.mockReturnValueOnce(true);

    const result = await receiveDocsWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-new",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "update",
      }),
    );

    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toEqual([]);
    }
    expect(mockNewDocumentPull).not.toHaveBeenCalled();
    expect(mockDocumentUpdatedPull).not.toHaveBeenCalled();
    const warnedAboutUnknown = warnSpy.mock.calls
      .flat()
      .find((a) => typeof a === "string" && a.includes("unknown_event_type"));
    expect(warnedAboutUnknown).toBeDefined();
    warnSpy.mockRestore();
  });
});
