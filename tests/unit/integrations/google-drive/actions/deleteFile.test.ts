/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockFilesDelete = jest.fn();
const mockFilesUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/filesDelete", () => ({
  filesDelete: (...args: unknown[]) => mockFilesDelete(...args),
}));

jest.mock("@/integrations/google-drive/api/filesUpdate", () => ({
  filesUpdate: (...args: unknown[]) => mockFilesUpdate(...args),
}));

// errors module is NOT mocked — the handler instanceof-checks against it,
// so the real NotFoundError class must be in scope.

import { deleteFile } from "@/integrations/google-drive/actions/deleteFile";
import { NotFoundError } from "@/integrations/google-drive/api/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesDelete.mockReset();
  mockFilesUpdate.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-drive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId: "alice@example.test",
    payload: {},
  };
}

describe("deleteFile action — permanent mode", () => {
  it("calls filesDelete and returns mode='permanent'", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesDelete.mockResolvedValue(undefined);

    const result = await deleteFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { fileId: "f-1", permanent: true },
      triggerEvent: trigger(),
    });

    expect(mockFilesDelete).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "f-1" }),
    );
    expect(mockFilesUpdate).not.toHaveBeenCalled();
    expect(result.output).toEqual({
      fileId: "f-1",
      mode: "permanent",
      alreadyDeleted: false,
    });
  });

  it("translates NotFoundError to alreadyDeleted=true (idempotency)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesDelete.mockRejectedValue(new NotFoundError("file f-1"));

    const result = await deleteFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { fileId: "f-1", permanent: true },
      triggerEvent: trigger(),
    });

    expect(result.output.alreadyDeleted).toBe(true);
    expect(result.output.mode).toBe("permanent");
  });
});

describe("deleteFile action — trash mode", () => {
  it("calls filesUpdate with body { trashed: true }", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesUpdate.mockResolvedValue({
      id: "f-1",
      trashed: true,
    });

    const result = await deleteFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { fileId: "f-1", permanent: false },
      triggerEvent: trigger(),
    });

    expect(mockFilesDelete).not.toHaveBeenCalled();
    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "f-1",
        body: { trashed: true },
      }),
    );
    expect(result.output).toEqual({
      fileId: "f-1",
      mode: "trash",
      trashed: true,
      alreadyDeleted: false,
    });
  });

  it("translates NotFoundError to alreadyDeleted=true on trash mode", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesUpdate.mockRejectedValue(new NotFoundError("file f-1"));

    const result = await deleteFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { fileId: "f-1", permanent: false },
      triggerEvent: trigger(),
    });

    expect(result.output.alreadyDeleted).toBe(true);
    expect(result.output.mode).toBe("trash");
  });
});

describe("deleteFile action — schema enforcement", () => {
  it("rejects missing permanent (Q11 — required, no hidden default)", async () => {
    await expect(
      deleteFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { fileId: "f-1" }, // permanent missing
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty fileId", async () => {
    await expect(
      deleteFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { fileId: "", permanent: true },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/fileId is required/);
  });

  it("propagates non-NotFound errors from filesDelete", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesDelete.mockRejectedValue(new Error("boom"));

    await expect(
      deleteFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { fileId: "f-1", permanent: true },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/boom/);
  });
});
