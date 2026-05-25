/**
 * @jest-environment node
 */
const mockListByConfigContains = jest.fn();
const mockVerifyChannelToken = jest.fn();
const mockPull = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) => mockListByConfigContains(...args),
}));

jest.mock("@/integrations/_shared/google/channelToken", () => ({
  verifyChannelToken: (...args: unknown[]) => mockVerifyChannelToken(...args),
}));

jest.mock("@/integrations/google-drive/triggers/fileChanged/pull", () => ({
  pull: (...args: unknown[]) => mockPull(...args),
}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveDriveWebhook } from "@/integrations/google-drive/webhooks/receive";

beforeEach(() => {
  mockListByConfigContains.mockReset();
  mockVerifyChannelToken.mockReset();
  mockPull.mockReset();
});

function makeRequest(headers: Record<string, string>): Request {
  return new Request("https://app.example.test/api/webhooks/google-drive", {
    method: "POST",
    headers,
  });
}

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  userId: "user-1",
  provider: "google-drive",
  eventType: "file_changed",
  nodeId: "n1",
  config: { channelId: "channel-1", pageToken: "page-1", fileId: "root" },
  accountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("receiveDriveWebhook", () => {
  it("throws InvalidSignatureError when channel headers are missing", async () => {
    await expect(
      receiveDriveWebhook(makeRequest({})),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("returns unknown_channel when no trigger row matches the channelId", async () => {
    mockListByConfigContains.mockResolvedValueOnce([]);

    const result = await receiveDriveWebhook(
      makeRequest({
        "x-goog-channel-id": "unknown-channel",
        "x-goog-channel-token": "any-token",
      }),
    );
    expect(result.kind).toBe("unknown_channel");
    expect(mockVerifyChannelToken).not.toHaveBeenCalled();
  });

  it("throws InvalidSignatureError on channel token mismatch", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(false);

    await expect(
      receiveDriveWebhook(
        makeRequest({
          "x-goog-channel-id": "channel-1",
          "x-goog-channel-token": "tampered",
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("returns handshake on resource_state=sync (no dispatch)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(true);

    const result = await receiveDriveWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "sync",
      }),
    );
    expect(result.kind).toBe("handshake");
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("pulls delta and returns events on resource_state=add (treats all non-sync states as 'go fetch')", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(true);
    mockPull.mockResolvedValueOnce({
      events: [
        {
          provider: "google-drive",
          eventType: "file_changed",
          eventId: "f-1:t1",
          occurredAt: "t1",
          accountId: "alice@example.com",
          payload: {
            changeKind: "created",
            objectKind: "file",
            fileId: "f-1",
            name: "report.pdf",
            mimeType: "application/pdf",
            parents: ["root"],
          },
        },
      ],
      resyncRequired: false,
    });

    const result = await receiveDriveWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "add",
      }),
    );

    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.eventId).toBe("f-1:t1");
    }
    expect(mockPull).toHaveBeenCalledWith(baseTrigger);
  });

  it("pulls delta on resource_state=update (Drive's granular states all route to pull)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(true);
    mockPull.mockResolvedValueOnce({ events: [], resyncRequired: false });

    const result = await receiveDriveWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "update",
      }),
    );
    expect(result.kind).toBe("events");
    expect(mockPull).toHaveBeenCalledWith(baseTrigger);
  });
});
