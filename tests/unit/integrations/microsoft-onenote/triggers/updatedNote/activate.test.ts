/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-5 — OneNote updated_note activation hook.
 *
 * Pinned contracts:
 *   - Requires notebookId + sectionId; pageId is optional (null when
 *     not provided).
 *   - Calls pagesList with `orderBy: "lastModifiedDateTime desc",
 *     top: 1`.
 *   - Seeds snapshot.lastSeenModifiedDateTime from newest page.
 *   - Empty section → seeds with wall-clock ISO.
 *   - Returns pollingEnabled:true.
 *   - Re-activation idempotent.
 */

const mockRefreshAndRetry = jest.fn();
const mockPagesList = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/microsoft-onenote/api/pagesList", () => ({
  pagesList: (...args: unknown[]) => mockPagesList(...args),
}));

import { activate } from "@/integrations/microsoft-onenote/triggers/updatedNote/activate";

const integration = {
  id: "int-1",
  userId: "user-1",
  provider: "microsoft-onenote",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (OneNote)",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: "REF",
  accessTokenExpiresAt: null,
  scopes: ["offline_access", "Notes.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "microsoft-onenote",
  type: "updated_note",
  config: {
    notebookId: "nb-1",
    sectionId: "sec-1",
  },
  position: { x: 0, y: 0 },
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPagesList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("updated_note activate — required config", () => {
  it("throws when sectionId missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { notebookId: "nb-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/sectionId is required/);
  });

  it("throws when notebookId missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { sectionId: "sec-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/notebookId is required/);
  });
});

describe("updated_note activate — happy path", () => {
  it("seeds snapshot from newest page's lastModifiedDateTime", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-newest",
          lastModifiedDateTime: "2026-05-23T12:00:00Z",
          createdDateTime: "2026-05-20T08:00:00Z",
        },
      ],
      nextLink: null,
    });
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(mockPagesList.mock.calls[0]![0]).toMatchObject({
      sectionId: "sec-1",
      orderBy: "lastModifiedDateTime desc",
      top: 1,
    });
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenModifiedDateTime: string;
    };
    expect(snapshot.lastSeenModifiedDateTime).toBe("2026-05-23T12:00:00Z");
    expect(result.pollingEnabled).toBe(true);
    expect((result as Record<string, unknown>).pageId).toBeNull();
  });

  it("preserves optional pageId when set in config", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    const result = await activate({
      node: {
        ...baseNode,
        config: { ...baseNode.config, pageId: "p-watch" },
      },
      integration,
      workflowId: "wf-1",
    });
    expect((result as Record<string, unknown>).pageId).toBe("p-watch");
  });

  it("treats empty-string pageId as null", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    const result = await activate({
      node: {
        ...baseNode,
        config: { ...baseNode.config, pageId: "" },
      },
      integration,
      workflowId: "wf-1",
    });
    expect((result as Record<string, unknown>).pageId).toBeNull();
  });
});

describe("updated_note activate — empty section", () => {
  it("seeds snapshot with current wall-clock ISO when no pages", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    const before = Date.now();
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    const after = Date.now();
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenModifiedDateTime: string;
    };
    const seedMs = Date.parse(snapshot.lastSeenModifiedDateTime);
    expect(seedMs).toBeGreaterThanOrEqual(before);
    expect(seedMs).toBeLessThanOrEqual(after);
  });
});
