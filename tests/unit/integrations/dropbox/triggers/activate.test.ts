/**
 * @jest-environment node
 *
 * Tests for `integrations/dropbox/triggers/newFile/activate.ts` —
 * Slice 3.DROPBOX-5. Seeds a list_folder cursor (first-poll-miss
 * protection), validates the configured path, stores accountId, and does
 * NO remote webhook creation.
 */
const mockRefreshAndRetry = jest.fn();
const mockGetLatestCursor = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});
jest.mock(
  "@/integrations/_shared/dropbox/api/filesListFolderGetLatestCursor",
  () => ({
    filesListFolderGetLatestCursor: (...args: unknown[]) =>
      mockGetLatestCursor(...args),
  }),
);

import { activate } from "@/integrations/dropbox/triggers/newFile/activate";
import type { ActivationContext } from "@/services/triggers/activationRegistry";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "dropbox",
  providerAccountId: "dbid:abc",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["files.metadata.read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(config: Record<string, unknown>): ActivationContext {
  return {
    node: {
      id: "node-1",
      kind: "trigger",
      provider: "dropbox",
      type: "new_file",
      config,
    } as unknown as ActivationContext["node"],
    integration,
    workflowId: "wf-1",
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetLatestCursor.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetLatestCursor.mockResolvedValue({ cursor: "CURSOR_SEED" });
});

describe("dropbox new_file activate", () => {
  it("seeds snapshot {cursor, accountId, capturedAt} via get_latest_cursor", async () => {
    const patch = await activate(ctx({ path: "/Reports", recursive: false }));
    expect(patch).toMatchObject({
      snapshot: { cursor: "CURSOR_SEED", accountId: "dbid:abc" },
    });
    expect(typeof (patch.snapshot as { capturedAt: string }).capturedAt).toBe(
      "string",
    );
  });

  it("calls get_latest_cursor with the configured path + recursive (NO remote webhook creation)", async () => {
    await activate(ctx({ path: "/Reports", recursive: true }));
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "dropbox",
      accountId: "dbid:abc",
    });
    expect(mockGetLatestCursor.mock.calls[0]![0]).toMatchObject({
      path: "/Reports",
      recursive: true,
    });
    // Exactly one Dropbox call — get_latest_cursor — and nothing else
    // (no create_webhook; Dropbox webhooks are app-level).
    expect(mockGetLatestCursor).toHaveBeenCalledTimes(1);
  });

  it("defaults path to root ('') + recursive false when unset", async () => {
    await activate(ctx({}));
    expect(mockGetLatestCursor.mock.calls[0]![0]).toMatchObject({
      path: "",
      recursive: false,
    });
  });

  it("validates the configured path — a non-root, non-slash path aborts activation", async () => {
    await expect(activate(ctx({ path: "Reports" }))).rejects.toThrow();
    // Aborted before any Dropbox call.
    expect(mockGetLatestCursor).not.toHaveBeenCalled();
  });

  it("propagates a get_latest_cursor failure (aborts the activate transition)", async () => {
    mockGetLatestCursor.mockRejectedValueOnce(new Error("dropbox down"));
    await expect(
      activate(ctx({ path: "/Reports" })),
    ).rejects.toThrow();
  });
});
