/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/filesCreateFolder", () => ({
  filesCreateFolder: (...a: unknown[]) => mockCreate(...a),
}));

import { createFolder } from "@/integrations/dropbox/actions/createFolder";

function input(config: Record<string, unknown>) {
  const triggerEvent: TriggerEvent = {
    provider: "dropbox",
    eventType: "manual",
    eventId: "e",
    occurredAt: "2026-05-24T00:00:00Z",
    providerAccountId: "dbid:1",
    payload: {},
  };
  return { workflowId: "wf", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent };
}

beforeEach(() => {
  mockRefresh.mockReset();
  mockCreate.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropbox create_folder", () => {
  it("creates a folder and returns id/name/path", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "id:f",
      name: "Reports",
      path_display: "/Reports",
    });
    const res = await createFolder(input({ path: "/Reports" }));
    expect(res.output).toEqual({ id: "id:f", name: "Reports", path: "/Reports" });
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({
      path: "/Reports",
      autorename: false,
    });
  });
});
