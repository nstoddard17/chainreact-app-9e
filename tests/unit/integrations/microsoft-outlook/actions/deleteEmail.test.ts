/**
 * @jest-environment node
 *
 * Tests for the delete_email action handler (Outlook Mail 2.2 Commit 2).
 * Two-mode action gated by Q11 deleteMode enum — trash → moveMessage,
 * permanent → deleteMessage. Both wrapped in refreshAndRetry.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockMoveMessage = jest.fn();
const mockDeleteMessage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/moveMessage", () => ({
  moveMessage: (...args: unknown[]) => mockMoveMessage(...args),
}));

jest.mock("@/integrations/microsoft-outlook/api/deleteMessage", () => ({
  deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
}));

import { deleteEmail } from "@/integrations/microsoft-outlook/actions/deleteEmail";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockMoveMessage.mockReset();
  mockDeleteMessage.mockReset();
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

describe("delete_email action — trash mode", () => {
  it("calls moveMessage(destinationId: 'deleteditems') and NOT deleteMessage", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("ms-token"),
    );
    mockMoveMessage.mockResolvedValue({ id: "moved-id" });

    const result = await deleteEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "AAMkAGI2", deleteMode: "trash" },
      triggerEvent: trigger(),
    });

    expect(mockMoveMessage).toHaveBeenCalledWith({
      accessToken: "ms-token",
      messageId: "AAMkAGI2",
      destinationId: "deleteditems",
    });
    expect(mockDeleteMessage).not.toHaveBeenCalled();

    expect(result.output).toEqual({
      deleted: true,
      emailId: "AAMkAGI2",
      mode: "trash",
    });
  });

  it("retries via refreshAndRetry on transient 401", async () => {
    let calls = 0;
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => {
      calls += 1;
      return apiCall("token");
    });
    mockMoveMessage.mockResolvedValue({ id: "moved" });

    await deleteEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", deleteMode: "trash" },
      triggerEvent: trigger(),
    });

    expect(calls).toBe(1);
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "microsoft-outlook" }),
    );
  });

  it("output mode stays 'trash' regardless of moveMessage response shape", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockMoveMessage.mockResolvedValue({ id: "moved", parentFolderId: "x" });

    const result = await deleteEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", deleteMode: "trash" },
      triggerEvent: trigger(),
    });

    expect(result.output.mode).toBe("trash");
  });
});

describe("delete_email action — permanent mode", () => {
  it("calls deleteMessage and NOT moveMessage", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("ms-token"),
    );
    mockDeleteMessage.mockResolvedValue(undefined);

    const result = await deleteEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "AAMkAGI2", deleteMode: "permanent" },
      triggerEvent: trigger(),
    });

    expect(mockDeleteMessage).toHaveBeenCalledWith({
      accessToken: "ms-token",
      messageId: "AAMkAGI2",
    });
    expect(mockMoveMessage).not.toHaveBeenCalled();

    expect(result.output).toEqual({
      deleted: true,
      emailId: "AAMkAGI2",
      mode: "permanent",
    });
  });

  it("retries via refreshAndRetry on transient 401", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("token"),
    );
    mockDeleteMessage.mockResolvedValue(undefined);

    await deleteEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", deleteMode: "permanent" },
      triggerEvent: trigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back to moveMessage if deleteMessage fails (no silent recovery)", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("graph-503"));

    await expect(
      deleteEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { emailId: "msg-1", deleteMode: "permanent" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/graph-503/);

    expect(mockMoveMessage).not.toHaveBeenCalled();
  });
});

describe("delete_email action — common behavior", () => {
  it("rejects missing deleteMode at the schema layer (Q11)", async () => {
    await expect(
      deleteEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { emailId: "msg-1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();

    expect(mockMoveMessage).not.toHaveBeenCalled();
    expect(mockDeleteMessage).not.toHaveBeenCalled();
  });

  it("rejects boolean deleteMode (legacy V1 shape)", async () => {
    await expect(
      deleteEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { emailId: "msg-1", deleteMode: false as unknown as "trash" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects missing emailId at the schema layer", async () => {
    await expect(
      deleteEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { deleteMode: "trash" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("threads accountId through when trigger came from microsoft-outlook", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockMoveMessage.mockResolvedValue({ id: "x" });

    await deleteEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", deleteMode: "trash" },
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
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockDeleteMessage.mockResolvedValue(undefined);

    await deleteEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", deleteMode: "permanent" },
      triggerEvent: trigger("slack"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        accountId: null,
      }),
    );
  });

  it("does NOT spread arbitrary provider response fields into the output (trash)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockMoveMessage.mockResolvedValue({
      id: "moved",
      changeKey: "ABCD",
      subject: "should not leak",
    });

    const result = await deleteEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", deleteMode: "trash" },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      deleted: true,
      emailId: "msg-1",
      mode: "trash",
    });
    expect((result.output as Record<string, unknown>).subject).toBeUndefined();
  });
});
