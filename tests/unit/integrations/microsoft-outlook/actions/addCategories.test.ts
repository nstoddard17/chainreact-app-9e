/**
 * @jest-environment node
 *
 * Tests for the add_categories action handler (Outlook Mail 2.2 Commit 2).
 * CSV / array / array-of-CSV parsed via shared parseCsvList; at-least-one
 * post-parse guard; refreshAndRetry-wrapped principal call; PATCH-replace
 * semantics on Graph categories[].
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockPatchMessage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/patchMessage", () => ({
  patchMessage: (...args: unknown[]) => mockPatchMessage(...args),
}));

import { addCategories } from "@/integrations/microsoft-outlook/actions/addCategories";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPatchMessage.mockReset();
});

function trigger(provider: string = "microsoft-outlook"): TriggerEvent {
  return {
    provider,
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("add_categories action", () => {
  it("splits CSV input into a flat list and PATCHes via patchMessage", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("ms-token"),
    );
    mockPatchMessage.mockResolvedValue({
      id: "AAMkAGI2",
      categories: ["Important", "Urgent", "Follow-up"],
    });

    const result = await addCategories({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        emailId: "AAMkAGI2",
        categories: "Important, Urgent, Follow-up",
      },
      triggerEvent: trigger(),
    });

    expect(mockPatchMessage).toHaveBeenCalledWith({
      accessToken: "ms-token",
      messageId: "AAMkAGI2",
      patch: { categories: ["Important", "Urgent", "Follow-up"] },
    });

    expect(result.output).toEqual({
      categorized: true,
      emailId: "AAMkAGI2",
      categories: ["Important", "Urgent", "Follow-up"],
    });
  });

  it("accepts an array of strings", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockPatchMessage.mockResolvedValue({
      id: "msg-1",
      categories: ["A", "B"],
    });

    await addCategories({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", categories: ["A", "B"] },
      triggerEvent: trigger(),
    });

    expect(mockPatchMessage.mock.calls[0]![0].patch.categories).toEqual([
      "A",
      "B",
    ]);
  });

  it("flattens an array of CSV strings", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockPatchMessage.mockResolvedValue({
      id: "msg-1",
      categories: ["A", "B", "C", "D"],
    });

    await addCategories({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        emailId: "msg-1",
        categories: ["A, B", "C", "  D  "],
      },
      triggerEvent: trigger(),
    });

    expect(mockPatchMessage.mock.calls[0]![0].patch.categories).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("trims whitespace around each category entry", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockPatchMessage.mockResolvedValue({
      id: "msg-1",
      categories: ["Work", "Personal"],
    });

    await addCategories({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", categories: "  Work  ,   Personal  " },
      triggerEvent: trigger(),
    });

    expect(mockPatchMessage.mock.calls[0]![0].patch.categories).toEqual([
      "Work",
      "Personal",
    ]);
  });

  it("rejects when categories parse to an empty list (whitespace-only CSV)", async () => {
    await expect(
      addCategories({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { emailId: "msg-1", categories: "   ,   ,   " },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/at least one category/);

    expect(mockPatchMessage).not.toHaveBeenCalled();
  });

  it("echoes Graph's authoritative categories array in the output (PATCH-replace)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    // Graph may return a different order/case than what was sent.
    mockPatchMessage.mockResolvedValue({
      id: "msg-1",
      categories: ["important", "urgent"],
    });

    const result = await addCategories({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", categories: "Important, Urgent" },
      triggerEvent: trigger(),
    });

    // Output uses Graph's response, not the input — the new authoritative list.
    expect(result.output.categories).toEqual(["important", "urgent"]);
  });

  it("falls back to parsed input list when Graph omits categories from response", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockPatchMessage.mockResolvedValue({ id: "msg-1" });

    const result = await addCategories({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", categories: "Important, Urgent" },
      triggerEvent: trigger(),
    });

    expect(result.output.categories).toEqual(["Important", "Urgent"]);
  });

  it("threads accountId through when trigger came from microsoft-outlook", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockPatchMessage.mockResolvedValue({ id: "msg-1", categories: ["A"] });

    await addCategories({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", categories: "A" },
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
    mockPatchMessage.mockResolvedValue({ id: "msg-1", categories: ["A"] });

    await addCategories({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", categories: "A" },
      triggerEvent: trigger("slack"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        accountId: null,
      }),
    );
  });

  it("rejects missing emailId at the schema layer", async () => {
    await expect(
      addCategories({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { categories: "A" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockPatchMessage).not.toHaveBeenCalled();
  });

  it("rejects missing categories at the schema layer", async () => {
    await expect(
      addCategories({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { emailId: "msg-1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockPatchMessage).not.toHaveBeenCalled();
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValue(
      new Error("Email not found. It may have been moved or deleted."),
    );

    await expect(
      addCategories({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { emailId: "missing", categories: "A" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/not found/);
  });

  it("does NOT spread arbitrary provider response fields into the output", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockPatchMessage.mockResolvedValue({
      id: "msg-1",
      categories: ["A"],
      changeKey: "ABCD",
      subject: "should not leak",
      body: { content: "neither should this" },
    });

    const result = await addCategories({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", categories: "A" },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      categorized: true,
      emailId: "msg-1",
      categories: ["A"],
    });
    expect((result.output as Record<string, unknown>).subject).toBeUndefined();
    expect((result.output as Record<string, unknown>).changeKey).toBeUndefined();
  });
});
