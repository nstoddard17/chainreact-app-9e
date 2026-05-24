/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockPageContentUpdate = jest.fn();
const mockPagesGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onenote/api/pageContentUpdate", () => ({
  pageContentUpdate: (...args: unknown[]) => mockPageContentUpdate(...args),
}));

jest.mock("@/integrations/microsoft-onenote/api/pagesGet", () => ({
  pagesGet: (...args: unknown[]) => mockPagesGet(...args),
}));

import { updatePage } from "@/integrations/microsoft-onenote/actions/updatePage";
import { UpdatePageConfigSchema } from "@/integrations/microsoft-onenote/actions/updatePage.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPageContentUpdate.mockReset();
  mockPagesGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockPageContentUpdate.mockResolvedValue(undefined);
  mockPagesGet.mockResolvedValue({
    id: "p-1",
    title: "After",
    contentUrl: "https://x/p-1/content",
    links: { oneNoteWebUrl: { href: "https://x/edit" } },
    lastModifiedDateTime: "2026-05-09T15:00:00Z",
  });
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-onenote",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "t",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("update_page schema", () => {
  it("updateMode defaults to 'append' (V1-preserved)", () => {
    const parsed = UpdatePageConfigSchema.parse({
      pageId: "p",
      content: "<p>x</p>",
    });
    expect(parsed.updateMode).toBe("append");
  });

  it("accepts the 4 V1 updateMode values", () => {
    for (const mode of ["append", "prepend", "replace", "insert"] as const) {
      const parsed = UpdatePageConfigSchema.parse({
        pageId: "p",
        content: "<p/>",
        updateMode: mode,
        // insert requires target
        ...(mode === "insert" ? { target: "#t" } : {}),
      });
      expect(parsed.updateMode).toBe(mode);
    }
  });

  it("requires target when updateMode is 'insert' (superRefine)", () => {
    expect(() =>
      UpdatePageConfigSchema.parse({
        pageId: "p",
        content: "<p/>",
        updateMode: "insert",
        // no target
      }),
    ).toThrow(/target is required/i);
  });

  it("does NOT require target for non-insert modes", () => {
    for (const mode of ["append", "prepend", "replace"] as const) {
      const parsed = UpdatePageConfigSchema.parse({
        pageId: "p",
        content: "<p/>",
        updateMode: mode,
      });
      expect(parsed.target).toBeUndefined();
    }
  });

  it("position defaults to 'after'", () => {
    const parsed = UpdatePageConfigSchema.parse({
      pageId: "p",
      content: "<p/>",
      updateMode: "insert",
      target: "#t",
    });
    expect(parsed.position).toBe("after");
  });
});

describe("update_page handler — operation construction", () => {
  it("append → operation { target: 'body', action: 'append' }", async () => {
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", content: "<p>new</p>", updateMode: "append" },
      triggerEvent: trigger(),
    });
    const call = mockPageContentUpdate.mock.calls[0]![0];
    expect(call.operations).toEqual([
      { target: "body", action: "append", content: "<p>new</p>" },
    ]);
  });

  it("prepend → operation { target: 'body', action: 'prepend' }", async () => {
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", content: "<p/>", updateMode: "prepend" },
      triggerEvent: trigger(),
    });
    expect(mockPageContentUpdate.mock.calls[0]![0].operations[0].action).toBe(
      "prepend",
    );
  });

  it("replace → operation { target: 'body', action: 'replace' } (body-wiping mode)", async () => {
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", content: "<p>new</p>", updateMode: "replace" },
      triggerEvent: trigger(),
    });
    const op = mockPageContentUpdate.mock.calls[0]![0].operations[0];
    expect(op.target).toBe("body");
    expect(op.action).toBe("replace");
  });

  it("insert with position='after' (default) → action 'after' targeting the picker", async () => {
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        pageId: "p-1",
        content: "<p>x</p>",
        updateMode: "insert",
        target: "#anchor",
      },
      triggerEvent: trigger(),
    });
    const op = mockPageContentUpdate.mock.calls[0]![0].operations[0];
    expect(op.target).toBe("#anchor");
    expect(op.action).toBe("after");
  });

  it("insert with position='before' → action 'before'", async () => {
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        pageId: "p-1",
        content: "<p>x</p>",
        updateMode: "insert",
        target: "#a",
        position: "before",
      },
      triggerEvent: trigger(),
    });
    expect(mockPageContentUpdate.mock.calls[0]![0].operations[0].action).toBe(
      "before",
    );
  });

  it("insert with position='inside' → Graph action 'append' (inside-element semantic)", async () => {
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        pageId: "p-1",
        content: "<p>x</p>",
        updateMode: "insert",
        target: "#a",
        position: "inside",
      },
      triggerEvent: trigger(),
    });
    expect(mockPageContentUpdate.mock.calls[0]![0].operations[0].action).toBe(
      "append",
    );
  });
});

describe("update_page handler — output shape", () => {
  it("outputs {id, title, contentUrl, webUrl, lastModifiedDateTime, success, updateMode}", async () => {
    const result = await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", content: "<p>x</p>", updateMode: "replace" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      id: "p-1",
      title: "After",
      contentUrl: "https://x/p-1/content",
      webUrl: "https://x/edit",
      lastModifiedDateTime: "2026-05-09T15:00:00Z",
      success: true,
      updateMode: "replace",
    });
  });

  it("performs read-after-write (PATCH then GET) — two refreshAndRetry calls", async () => {
    await updatePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1", content: "<p/>", updateMode: "append" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    expect(mockPageContentUpdate).toHaveBeenCalledTimes(1);
    expect(mockPagesGet).toHaveBeenCalledTimes(1);
  });
});
