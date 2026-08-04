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
import { MoveEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/moveEmail.schema";

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

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling moveEmail.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the move_email config schema (Outlook Mail 2.2 Commit 2).
// Both fields required + non-empty; strict mode rejects unknowns.
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  emailId: "AAMkAGI2",
  destinationFolderId: "deleteditems",
};

describe("MoveEmailConfigSchema", () => {
  it("accepts the minimal valid config", () => {
    expect(() => MoveEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts a custom folder id (not just well-known names)", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        destinationFolderId: "AQMkAGE-custom-folder-id",
      }),
    ).not.toThrow();
  });

  it("rejects missing emailId", () => {
    const { emailId: _emailId, ...rest } = VALID_CONFIG;
    expect(() => MoveEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({ ...VALID_CONFIG, emailId: "" }),
    ).toThrow();
  });

  it("rejects missing destinationFolderId", () => {
    const { destinationFolderId: _d, ...rest } = VALID_CONFIG;
    expect(() => MoveEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string destinationFolderId", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        destinationFolderId: "",
      }),
    ).toThrow();
  });

  it("rejects non-string emailId", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        emailId: 42 as unknown as string,
      }),
    ).toThrow();
  });

  it("rejects non-string destinationFolderId", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        destinationFolderId: { id: "x" } as unknown as string,
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });

  it("does NOT silently coerce types", () => {
    // Strict mode + explicit string schemas — no coercion.
    expect(() =>
      MoveEmailConfigSchema.parse({
        ...VALID_CONFIG,
        emailId: true as unknown as string,
      }),
    ).toThrow();
  });
});
