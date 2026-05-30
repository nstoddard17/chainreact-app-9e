/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefresh = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...a: unknown[]) => mockRefresh(...a),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/dropbox/api/sharingCreateSharedLink", () => ({
  sharingCreateSharedLink: (...a: unknown[]) => mockCreate(...a),
}));
jest.mock("@/integrations/_shared/dropbox/api/sharingListSharedLinks", () => ({
  sharingListSharedLinks: (...a: unknown[]) => mockList(...a),
}));

import { createSharedLink } from "@/integrations/dropbox/actions/createSharedLink";
import { DropboxConflictError } from "@/integrations/_shared/dropbox/errors";

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
  mockList.mockReset();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropbox create_shared_link", () => {
  it("creates a new link (linkExisted=false)", async () => {
    mockCreate.mockResolvedValueOnce({ url: "https://db/new", id: "id:s" });
    const res = await createSharedLink(input({ path: "/x" }));
    expect(res.output).toEqual({
      sharedUrl: "https://db/new",
      path: "/x",
      id: "id:s",
      linkExisted: false,
    });
    expect(mockList).not.toHaveBeenCalled();
  });

  it("D-DB8: reuses the existing link on shared_link_already_exists conflict", async () => {
    mockCreate.mockRejectedValueOnce(
      new DropboxConflictError("shared_link_already_exists/.."),
    );
    mockList.mockResolvedValueOnce([{ url: "https://db/existing", id: "id:e" }]);
    const res = await createSharedLink(input({ path: "/x" }));
    expect(res.output).toEqual({
      sharedUrl: "https://db/existing",
      path: "/x",
      id: "id:e",
      linkExisted: true,
    });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("re-throws non-shared-link conflicts", async () => {
    mockCreate.mockRejectedValueOnce(new DropboxConflictError("path/conflict/.."));
    await expect(createSharedLink(input({ path: "/x" }))).rejects.toBeInstanceOf(
      DropboxConflictError,
    );
    expect(mockList).not.toHaveBeenCalled();
  });
});
