/**
 * @jest-environment node
 *
 * Tests for the Google Drive createFolder action handler. Mocks
 * refreshAndRetry + filesCreate at the module boundary; the handler's
 * apiCall closure is exercised by driving refreshAndRetry to invoke it.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockFilesCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/filesCreate", () => ({
  filesCreate: (...args: unknown[]) => mockFilesCreate(...args),
}));

import { createFolder } from "@/integrations/google-drive/actions/createFolder";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesCreate.mockReset();
});

function driveTrigger(providerAccountId: string): TriggerEvent {
  return {
    provider: "google-drive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId,
    payload: {},
  };
}

function nonDriveTrigger(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "message_received",
    eventId: "evt-2",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "T123",
    payload: {},
  };
}

describe("createFolder action", () => {
  it("creates a folder at root when parentFolderId is unset", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => {
      return apiCall("ya29.access");
    });
    mockFilesCreate.mockResolvedValue({
      id: "fld-123",
      name: "Reports",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
      webViewLink: "https://drive.google.com/drive/folders/fld-123",
      createdTime: "2026-05-08T12:00:00Z",
    });

    const result = await createFolder({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { name: "Reports" },
      triggerEvent: driveTrigger("alice@example.test"),
    });

    expect(result.output.folderId).toBe("fld-123");
    expect(result.output.name).toBe("Reports");
    expect(result.output.parents).toEqual(["root"]);
    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "ya29.access",
        body: {
          name: "Reports",
          mimeType: "application/vnd.google-apps.folder",
        },
      }),
    );
  });

  it("attaches parents[] when parentFolderId is set", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesCreate.mockResolvedValue({
      id: "fld-2",
      name: "Sub",
      parents: ["fld-parent"],
    });

    await createFolder({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { name: "Sub", parentFolderId: "fld-parent" },
      triggerEvent: driveTrigger("alice@example.test"),
    });

    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ parents: ["fld-parent"] }),
      }),
    );
  });

  it("passes accountId through when trigger is from google-drive", async () => {
    mockRefreshAndRetry.mockResolvedValue({ id: "x", parents: [] });

    await createFolder({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { name: "F" },
      triggerEvent: driveTrigger("alice@example.test"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google-drive",
        providerAccountId: "alice@example.test",
      }),
    );
  });

  it("passes accountId=null when trigger is NOT from google-drive", async () => {
    mockRefreshAndRetry.mockResolvedValue({ id: "x", parents: [] });

    await createFolder({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { name: "F" },
      triggerEvent: nonDriveTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ providerAccountId: null }),
    );
  });

  it("rejects strict-mode config (unknown fields)", async () => {
    await expect(
      createFolder({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { name: "F", mimeType: "text/plain" }, // mimeType not allowed
        triggerEvent: driveTrigger("a@e.test"),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty name", async () => {
    await expect(
      createFolder({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { name: "" },
        triggerEvent: driveTrigger("a@e.test"),
      }),
    ).rejects.toThrow(/name is required/);
  });
});
