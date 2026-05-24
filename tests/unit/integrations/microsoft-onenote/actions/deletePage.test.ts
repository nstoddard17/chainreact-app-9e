/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockPagesDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onenote/api/pagesDelete", () => ({
  pagesDelete: (...args: unknown[]) => mockPagesDelete(...args),
}));

import { deletePage } from "@/integrations/microsoft-onenote/actions/deletePage";
import { DeletePageConfigSchema } from "@/integrations/microsoft-onenote/actions/deletePage.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPagesDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-onenote",
    eventType: "manual",
    eventId: "e",
    occurredAt: "t",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("delete_page schema", () => {
  it("requires pageId", () => {
    expect(() => DeletePageConfigSchema.parse({})).toThrow();
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      DeletePageConfigSchema.parse({
        pageId: "p",
        notebookId: "n", // V1-style cascade parent, not allowed at runtime
      }),
    ).toThrow();
  });
});

describe("delete_page handler", () => {
  it("output: {success: true, deletedPageId, deletedAt}", async () => {
    mockPagesDelete.mockResolvedValueOnce(undefined);
    const result = await deletePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(result.output.success).toBe(true);
    expect(result.output.deletedPageId).toBe("p-1");
    expect(typeof result.output.deletedAt).toBe("string");
  });

  it("output does NOT include any page body content (matches V1 + structural sensitive-output rules)", async () => {
    mockPagesDelete.mockResolvedValueOnce(undefined);
    const result = await deletePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    const keys = Object.keys(result.output);
    expect(keys).not.toContain("content");
    expect(keys).not.toContain("body");
    expect(keys).not.toContain("title");
  });

  it("passes provider='microsoft-onenote' to refreshAndRetry", async () => {
    mockPagesDelete.mockResolvedValueOnce(undefined);
    await deletePage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { pageId: "p-1" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe(
      "microsoft-onenote",
    );
  });
});
