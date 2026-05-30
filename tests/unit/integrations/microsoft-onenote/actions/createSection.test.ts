/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onenote/api/sectionsCreate", () => ({
  sectionsCreate: (...args: unknown[]) => mockCreate(...args),
}));

import { createSection } from "@/integrations/microsoft-onenote/actions/createSection";
import { CreateSectionConfigSchema } from "@/integrations/microsoft-onenote/actions/createSection.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trig: TriggerEvent = {
  provider: "microsoft-onenote",
  eventType: "manual",
  eventId: "e",
  occurredAt: "t",
  providerAccountId: "alice@contoso.com",
  payload: {},
};

describe("create_section", () => {
  it("schema requires notebookId + displayName", () => {
    expect(() =>
      CreateSectionConfigSchema.parse({ notebookId: "n" }),
    ).toThrow();
    expect(() =>
      CreateSectionConfigSchema.parse({ displayName: "x" }),
    ).toThrow();
  });

  it("forwards notebookId to the create wrapper", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "sec-1",
      displayName: "Q4 Notes",
    });
    await createSection({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { notebookId: "nb-1", displayName: "Q4 Notes" },
      triggerEvent: trig,
    });
    expect(mockCreate.mock.calls[0]![0].notebookId).toBe("nb-1");
    expect(mockCreate.mock.calls[0]![0].displayName).toBe("Q4 Notes");
  });

  it("output: id / displayName / createdDateTime / lastModifiedDateTime / isDefault / pagesUrl", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "sec-1",
      displayName: "Q4",
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-01T00:00:00Z",
      isDefault: false,
      pagesUrl: "https://x/sec-1/pages",
    });
    const result = await createSection({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { notebookId: "nb-1", displayName: "Q4" },
      triggerEvent: trig,
    });
    expect(result.output).toEqual({
      id: "sec-1",
      displayName: "Q4",
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-01T00:00:00Z",
      isDefault: false,
      pagesUrl: "https://x/sec-1/pages",
    });
  });
});
