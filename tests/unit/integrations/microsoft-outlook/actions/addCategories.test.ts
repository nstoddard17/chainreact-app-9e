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
import { AddCategoriesConfigSchema } from "@/integrations/microsoft-outlook/actions/addCategories.schema";

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
    providerAccountId: "alice@contoso.com",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
        accountId: "acct-u",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
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
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", categories: "A" },
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
    mockPatchMessage.mockResolvedValue({ id: "msg-1", categories: ["A"] });

    await addCategories({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { emailId: "msg-1", categories: "A" },
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
    await expect(
      addCategories({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
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
        accountId: "acct-u",
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
        accountId: "acct-u",
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
      accountId: "acct-u",
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

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling addCategories.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the add_categories config schema (Outlook Mail 2.2 Commit 2).
// CSV-string-or-array accepted; min-1 enforced on each branch; strict
// mode rejects unknowns. Whitespace-only post-parse is caught by the
// handler, not the schema.
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  emailId: "AAMkAGI2",
  categories: "Important",
};

describe("AddCategoriesConfigSchema", () => {
  it("accepts a single-category string", () => {
    expect(() => AddCategoriesConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts a CSV string of multiple categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: "Important, Urgent, Follow-up",
      }),
    ).not.toThrow();
  });

  it("accepts an array of strings", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: ["Important", "Urgent"],
      }),
    ).not.toThrow();
  });

  it("accepts a single-element array", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: ["Important"],
      }),
    ).not.toThrow();
  });

  it("accepts whitespace-only CSV at schema layer (handler catches it)", () => {
    // Schema-layer min(1) only catches "no value at all". The whitespace-
    // only path is caught by the handler after parseCsvList yields [].
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: "   ,   ",
      }),
    ).not.toThrow();
  });

  it("rejects empty-string categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: "",
      }),
    ).toThrow();
  });

  it("rejects empty-array categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: [],
      }),
    ).toThrow();
  });

  it("rejects missing categories", () => {
    const { categories: _c, ...rest } = VALID_CONFIG;
    expect(() => AddCategoriesConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing emailId", () => {
    const { emailId: _emailId, ...rest } = VALID_CONFIG;
    expect(() => AddCategoriesConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({ ...VALID_CONFIG, emailId: "" }),
    ).toThrow();
  });

  it("rejects non-string non-array categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: { name: "x" } as unknown as string,
      }),
    ).toThrow();
  });

  it("rejects array with non-string entries", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: ["a", 42 as unknown as string],
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });

  it("rejects boolean categories", () => {
    expect(() =>
      AddCategoriesConfigSchema.parse({
        ...VALID_CONFIG,
        categories: true as unknown as string,
      }),
    ).toThrow();
  });
});
