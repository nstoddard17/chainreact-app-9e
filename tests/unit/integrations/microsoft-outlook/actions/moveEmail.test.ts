/**
 * @jest-environment node
 *
 * Tests for the move_email action handler (Outlook Mail 2.2 Commit 2).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockMoveMessage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/moveMessage", () => ({
  moveMessage: (...args: unknown[]) => mockMoveMessage(...args),
}));

import { moveEmail } from "@/integrations/microsoft-outlook/actions/moveEmail";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockMoveMessage.mockReset();
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

const BASE_CONFIG = {
  emailId: "AAMkAGI2-orig",
  destinationFolderId: "archive",
};

describe("move_email action", () => {
  it("calls moveMessage with messageId + destinationId from config", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("ms-token"),
    );
    mockMoveMessage.mockResolvedValue({
      id: "AAMkAGI2-new",
      parentFolderId: "archive",
    });

    const result = await moveEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    expect(mockMoveMessage).toHaveBeenCalledWith({
      accessToken: "ms-token",
      messageId: "AAMkAGI2-orig",
      destinationId: "archive",
    });

    expect(result.output).toEqual({
      moved: true,
      emailId: "AAMkAGI2-orig",
      newId: "AAMkAGI2-new",
      destinationFolderId: "archive",
    });
  });

  it("returns the new Graph message id (Outlook re-keys on move)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockMoveMessage.mockResolvedValue({ id: "different-id-from-source" });

    const result = await moveEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    expect(result.output.newId).toBe("different-id-from-source");
    // Original emailId is also echoed.
    expect(result.output.emailId).toBe("AAMkAGI2-orig");
  });

  it("passes well-known destination names verbatim (e.g. 'deleteditems')", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockMoveMessage.mockResolvedValue({ id: "x" });

    await moveEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { ...BASE_CONFIG, destinationFolderId: "deleteditems" },
      triggerEvent: trigger(),
    });

    expect(mockMoveMessage.mock.calls[0]![0].destinationId).toBe(
      "deleteditems",
    );
  });

  it("threads accountId through when trigger came from microsoft-outlook", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockMoveMessage.mockResolvedValue({ id: "x" });

    await moveEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger("microsoft-outlook"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        providerAccountId: "alice@contoso.com",
      }),
    );
  });

  it("passes accountId: null when trigger came from a different provider", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockMoveMessage.mockResolvedValue({ id: "x" });

    await moveEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger("slack"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        providerAccountId: null,
      }),
    );
  });

  it("rejects missing emailId at the schema layer", async () => {
    const { emailId: _emailId, ...rest } = BASE_CONFIG;
    await expect(
      moveEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockMoveMessage).not.toHaveBeenCalled();
  });

  it("rejects missing destinationFolderId at the schema layer", async () => {
    const { destinationFolderId: _d, ...rest } = BASE_CONFIG;
    await expect(
      moveEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockMoveMessage).not.toHaveBeenCalled();
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValue(
      new Error("Email not found. It may have been moved or deleted."),
    );

    await expect(
      moveEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: BASE_CONFIG,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/not found/);
  });

  it("does NOT spread arbitrary provider response fields into the output", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockMoveMessage.mockResolvedValue({
      id: "new-id",
      parentFolderId: "archive",
      changeKey: "ABCD",
      subject: "should not leak",
      body: { content: "neither should this" },
    });

    const result = await moveEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      moved: true,
      emailId: "AAMkAGI2-orig",
      newId: "new-id",
      destinationFolderId: "archive",
    });
    expect((result.output as Record<string, unknown>).subject).toBeUndefined();
    expect((result.output as Record<string, unknown>).changeKey).toBeUndefined();
  });

  it("rejects unknown config fields (strict mode)", async () => {
    await expect(
      moveEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ...BASE_CONFIG, leak: "x" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockMoveMessage).not.toHaveBeenCalled();
  });

  it("wraps the principal call in refreshAndRetry (Q3)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockMoveMessage.mockResolvedValue({ id: "x" });

    await moveEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct-u" }),
    );
  });
});
