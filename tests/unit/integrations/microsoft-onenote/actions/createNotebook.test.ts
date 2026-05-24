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

jest.mock("@/integrations/microsoft-onenote/api/notebooksCreate", () => ({
  notebooksCreate: (...args: unknown[]) => mockCreate(...args),
}));

import { createNotebook } from "@/integrations/microsoft-onenote/actions/createNotebook";
import { CreateNotebookConfigSchema } from "@/integrations/microsoft-onenote/actions/createNotebook.schema";

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
  accountId: "alice@contoso.com",
  payload: {},
};

describe("create_notebook", () => {
  it("schema requires displayName, rejects unknowns", () => {
    expect(() => CreateNotebookConfigSchema.parse({})).toThrow();
    expect(() =>
      CreateNotebookConfigSchema.parse({ displayName: "x", extra: "y" }),
    ).toThrow();
  });

  it("output includes id / displayName / isDefault / isShared / sectionsUrl / sectionGroupsUrl + timestamps", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "nb-1",
      displayName: "Work",
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-01T00:00:00Z",
      isDefault: false,
      isShared: false,
      sectionsUrl: "https://x/nb-1/sections",
      sectionGroupsUrl: "https://x/nb-1/sectionGroups",
    });
    const result = await createNotebook({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { displayName: "Work" },
      triggerEvent: trig,
    });
    expect(result.output).toEqual({
      id: "nb-1",
      displayName: "Work",
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-01T00:00:00Z",
      isDefault: false,
      isShared: false,
      sectionsUrl: "https://x/nb-1/sections",
      sectionGroupsUrl: "https://x/nb-1/sectionGroups",
    });
  });
});
