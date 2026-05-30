/**
 * @jest-environment node
 */
const mockListByConfigContains = jest.fn();
const mockVerifyChannelToken = jest.fn();
const mockPull = jest.fn();
const mockNewWorksheetPull = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) => mockListByConfigContains(...args),
}));

jest.mock("@/integrations/_shared/google/channelToken", () => ({
  verifyChannelToken: (...args: unknown[]) => mockVerifyChannelToken(...args),
}));

jest.mock("@/integrations/google-sheets/triggers/rowChanged/pull", () => ({
  pull: (...args: unknown[]) => mockPull(...args),
}));

jest.mock("@/integrations/google-sheets/triggers/newWorksheet/pull", () => ({
  pull: (...args: unknown[]) => mockNewWorksheetPull(...args),
}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveSheetsWebhook } from "@/integrations/google-sheets/webhooks/receive";

beforeEach(() => {
  mockListByConfigContains.mockReset();
  mockVerifyChannelToken.mockReset();
  mockPull.mockReset();
  mockNewWorksheetPull.mockReset();
});

function makeRequest(headers: Record<string, string>): Request {
  return new Request("https://app.example.test/api/webhooks/google-sheets", {
    method: "POST",
    headers,
  });
}

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-sheets",
  eventType: "row_changed",
  nodeId: "n1",
  config: {
    channelId: "channel-1",
    spreadsheetId: "ss-1",
    sheetName: "Sheet1",
    lastRowCount: 3,
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("receiveSheetsWebhook", () => {
  it("throws InvalidSignatureError when channel headers are missing", async () => {
    await expect(
      receiveSheetsWebhook(makeRequest({})),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("returns unknown_channel when no trigger row matches the channelId", async () => {
    mockListByConfigContains.mockResolvedValueOnce([]);

    const result = await receiveSheetsWebhook(
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
      receiveSheetsWebhook(
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

    const result = await receiveSheetsWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "sync",
      }),
    );
    expect(result.kind).toBe("handshake");
    expect(mockPull).not.toHaveBeenCalled();
  });

  it("pulls delta and returns events on resource_state=add", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(true);
    mockPull.mockResolvedValueOnce({
      events: [
        {
          provider: "google-sheets",
          eventType: "row_changed",
          eventId: "ss-1:Sheet1:4:abc123",
          occurredAt: "2026-05-08T12:00:00Z",
          providerAccountId: "alice@example.com",
          payload: {
            changeKind: "added",
            spreadsheetId: "ss-1",
            sheetName: "Sheet1",
            rowIndex: 4,
            rowValues: ["x"],
            headers: null,
          },
        },
      ],
      resyncRequired: false,
    });

    const result = await receiveSheetsWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "add",
      }),
    );

    expect(result.kind).toBe("events");
    if (result.kind === "events") {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.eventId).toBe("ss-1:Sheet1:4:abc123");
    }
    expect(mockPull).toHaveBeenCalledWith(baseTrigger);
  });

  it("pulls delta on resource_state=update (Drive's granular states all route to pull)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
    mockVerifyChannelToken.mockReturnValueOnce(true);
    mockPull.mockResolvedValueOnce({ events: [], resyncRequired: false });

    const result = await receiveSheetsWebhook(
      makeRequest({
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "valid",
        "x-goog-resource-state": "update",
      }),
    );
    expect(result.kind).toBe("events");
    expect(mockPull).toHaveBeenCalledWith(baseTrigger);
  });

  // ────────────────────────────────────────────────────────────────
  // Sheets 2.3 Commit 4 — receive route dispatches by eventType.
  // ────────────────────────────────────────────────────────────────
  describe("event type dispatch", () => {
    const newWorksheetTrigger = {
      ...baseTrigger,
      id: "tr-2",
      eventType: "new_worksheet",
      config: {
        channelId: "channel-2",
        spreadsheetId: "ss-1",
        worksheetSnapshot: {
          names: ["Sheet1"],
          updatedAt: "2026-05-15T00:00:00.000Z",
        },
      },
    };

    it("dispatches new_worksheet trigger to the new_worksheet pull", async () => {
      mockListByConfigContains.mockResolvedValueOnce([newWorksheetTrigger]);
      mockVerifyChannelToken.mockReturnValueOnce(true);
      mockNewWorksheetPull.mockResolvedValueOnce({
        events: [
          {
            provider: "google-sheets",
            eventType: "new_worksheet",
            eventId: "ss-1:new_worksheet:42:abc123",
            occurredAt: "2026-05-15T12:00:00Z",
            providerAccountId: "alice@example.com",
            payload: {
              changeKind: "added",
              spreadsheetId: "ss-1",
              worksheetId: 42,
              worksheetName: "Sheet2",
              index: 1,
              sheetType: "GRID",
            },
          },
        ],
        resyncRequired: false,
      });

      const result = await receiveSheetsWebhook(
        makeRequest({
          "x-goog-channel-id": "channel-2",
          "x-goog-channel-token": "valid",
          "x-goog-resource-state": "update",
        }),
      );

      expect(result.kind).toBe("events");
      if (result.kind === "events") {
        expect(result.events).toHaveLength(1);
        expect(result.events[0]!.eventType).toBe("new_worksheet");
      }
      expect(mockNewWorksheetPull).toHaveBeenCalledWith(newWorksheetTrigger);
      // Critical: row_changed pull was NOT invoked for the
      // new_worksheet trigger.
      expect(mockPull).not.toHaveBeenCalled();
    });

    it("dispatches row_changed trigger to the row_changed pull (no cross-talk)", async () => {
      mockListByConfigContains.mockResolvedValueOnce([baseTrigger]);
      mockVerifyChannelToken.mockReturnValueOnce(true);
      mockPull.mockResolvedValueOnce({ events: [], resyncRequired: false });

      await receiveSheetsWebhook(
        makeRequest({
          "x-goog-channel-id": "channel-1",
          "x-goog-channel-token": "valid",
          "x-goog-resource-state": "update",
        }),
      );

      expect(mockPull).toHaveBeenCalledWith(baseTrigger);
      expect(mockNewWorksheetPull).not.toHaveBeenCalled();
    });

    it("logs + acks an unknown event type without dispatching", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      mockListByConfigContains.mockResolvedValueOnce([
        { ...baseTrigger, eventType: "uninstalled_in_a_future_slice" },
      ]);
      mockVerifyChannelToken.mockReturnValueOnce(true);

      const result = await receiveSheetsWebhook(
        makeRequest({
          "x-goog-channel-id": "channel-1",
          "x-goog-channel-token": "valid",
          "x-goog-resource-state": "update",
        }),
      );

      expect(result.kind).toBe("events");
      if (result.kind === "events") {
        expect(result.events).toEqual([]);
      }
      expect(mockPull).not.toHaveBeenCalled();
      expect(mockNewWorksheetPull).not.toHaveBeenCalled();
      const warnedAboutUnknown = warnSpy.mock.calls
        .flat()
        .find(
          (a) =>
            typeof a === "string" && a.includes("unknown_event_type"),
        );
      expect(warnedAboutUnknown).toBeDefined();
      warnSpy.mockRestore();
    });
  });
});
