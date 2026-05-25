/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockSearch = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/filesSearch", () => ({
  filesSearch: (...a: unknown[]) => mockSearch(...a),
}));

import { searchFiles } from "@/integrations/dropbox/actions/searchFiles";

function input(config: Record<string, unknown>) {
  const triggerEvent: TriggerEvent = {
    provider: "dropbox",
    eventType: "manual",
    eventId: "e",
    occurredAt: "2026-05-24T00:00:00Z",
    accountId: "dbid:1",
    payload: {},
  };
  return { workflowId: "wf", userId: "u", runId: "r", nodeId: "n", config, triggerEvent };
}

beforeEach(() => {
  mockRefresh.mockReset();
  mockSearch.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropbox search_files", () => {
  it("normalizes matches + count + hasMore + cursor", async () => {
    mockSearch.mockResolvedValueOnce({
      entries: [{ id: "id:1", name: "q1.pdf", path_display: "/q1.pdf" }],
      hasMore: false,
      cursor: null,
    });
    const res = await searchFiles(input({ query: "q1" }));
    expect(res.output.count).toBe(1);
    expect(res.output.hasMore).toBe(false);
    const matches = res.output.matches as Array<{ name: string }>;
    expect(matches[0]!.name).toBe("q1.pdf");
  });

  it("forwards query + optional path/maxResults", async () => {
    mockSearch.mockResolvedValueOnce({ entries: [], hasMore: false, cursor: null });
    await searchFiles(input({ query: "report", path: "/Reports", maxResults: 10 }));
    expect(mockSearch.mock.calls[0]![0]).toMatchObject({
      query: "report",
      path: "/Reports",
      maxResults: 10,
    });
  });
});
