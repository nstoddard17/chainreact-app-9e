/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCopy = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onenote/api/pagesCopyToSection", () => ({
  pagesCopyToSection: (...args: unknown[]) => mockCopy(...args),
}));

import { copyPage } from "@/integrations/microsoft-onenote/actions/copyPage";
import { CopyPageConfigSchema } from "@/integrations/microsoft-onenote/actions/copyPage.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCopy.mockReset();
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
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

describe("copy_page schema", () => {
  it("requires sourcePageId + targetSectionId", () => {
    expect(() =>
      CopyPageConfigSchema.parse({ sourcePageId: "p" }),
    ).toThrow();
    expect(() =>
      CopyPageConfigSchema.parse({ targetSectionId: "s" }),
    ).toThrow();
  });

  it("rejects V1 cascade parent fields (sourceNotebookId / sourceSectionId / targetNotebookId — UI-only, not runtime)", () => {
    expect(() =>
      CopyPageConfigSchema.parse({
        sourcePageId: "p",
        targetSectionId: "s",
        sourceNotebookId: "n", // V1-manifest cascade parent — not allowed at runtime
      }),
    ).toThrow();
  });
});

describe("copy_page handler", () => {
  it("ONENOTE-1 D-ON2: returns operationLocation (async — does NOT poll)", async () => {
    mockCopy.mockResolvedValueOnce({
      operationLocation: "https://graph.microsoft.com/v1.0/operations/op-1",
    });

    const result = await copyPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { sourcePageId: "p-1", targetSectionId: "s-target" },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      operationLocation: "https://graph.microsoft.com/v1.0/operations/op-1",
      sourcePageId: "p-1",
      targetSectionId: "s-target",
      // "Graph accepted" — NOT "copy complete." Description in
      // ONENOTE-4 meta warns.
      success: true,
    });
  });

  it("only calls Graph copyToSection once — no operation polling", async () => {
    mockCopy.mockResolvedValueOnce({ operationLocation: "https://x/op" });
    await copyPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { sourcePageId: "p", targetSectionId: "s" },
      triggerEvent: trigger(),
    });
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
  });

  it("output.operationLocation can be null when Graph omits the header (defensive)", async () => {
    mockCopy.mockResolvedValueOnce({ operationLocation: null });
    const result = await copyPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { sourcePageId: "p", targetSectionId: "s" },
      triggerEvent: trigger(),
    });
    expect(result.output.operationLocation).toBeNull();
    // success still true — Graph accepted; no operation-location header
    // is the rare edge case (always present on 202 in practice).
    expect(result.output.success).toBe(true);
  });

  it("passes provider='microsoft-onenote' to refreshAndRetry", async () => {
    mockCopy.mockResolvedValueOnce({ operationLocation: "https://x" });
    await copyPage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { sourcePageId: "p", targetSectionId: "s" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe(
      "microsoft-onenote",
    );
  });
});
