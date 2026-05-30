/**
 * @jest-environment node
 *
 * Slice 3.ONENOTE-5 — OneNote new_note activation hook.
 *
 * Pinned contracts:
 *   - Requires `notebookId` + `sectionId` in node.config (both throw on
 *     missing/empty).
 *   - Calls `pagesList` exactly once with `{sectionId, orderBy:
 *     "createdDateTime desc", top: 1}`.
 *   - Calls refreshAndRetry with provider=microsoft-onenote and
 *     accountId=integration.providerAccountId.
 *   - Stores newest page's `createdDateTime` as
 *     `snapshot.lastSeenCreatedDateTime` when section has pages.
 *   - Empty section → seeds with current wall-clock ISO timestamp
 *     (first-poll-miss protection, empty-section case).
 *   - Returns `pollingEnabled: true`.
 *   - Re-activation idempotent — each call re-seeds from CURRENT
 *     newest; missed pages during disabled window are NOT replayed.
 */

const mockRefreshAndRetry = jest.fn();
const mockPagesList = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/microsoft-onenote/api/pagesList", () => ({
  pagesList: (...args: unknown[]) => mockPagesList(...args),
}));

import { activate } from "@/integrations/microsoft-onenote/triggers/newNote/activate";

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-onenote",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (OneNote)",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: "REF",
  accessTokenExpiresAt: "2026-05-24T00:00:00Z",
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
  type: "new_note",
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

describe("new_note activate — required config", () => {
  it("throws when sectionId is missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { notebookId: "nb-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/sectionId is required/);
    expect(mockPagesList).not.toHaveBeenCalled();
  });

  it("throws when notebookId is missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { sectionId: "sec-1" } },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/notebookId is required/);
    expect(mockPagesList).not.toHaveBeenCalled();
  });

  it("throws when sectionId is empty string", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { notebookId: "nb-1", sectionId: "" },
        },
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/sectionId is required/);
  });
});

describe("new_note activate — happy path (section has pages)", () => {
  it("seeds snapshot from the newest page's createdDateTime", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        {
          id: "p-newest",
          title: "Newest",
          createdDateTime: "2026-05-23T12:00:00Z",
          lastModifiedDateTime: "2026-05-23T12:00:00Z",
        },
      ],
      nextLink: null,
    });
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-onenote");
    expect(args.accountId).toBe("alice@contoso.com");

    expect(mockPagesList).toHaveBeenCalledTimes(1);
    expect(mockPagesList.mock.calls[0]![0]).toMatchObject({
      sectionId: "sec-1",
      orderBy: "createdDateTime desc",
      top: 1,
    });

    expect(result.pollingEnabled).toBe(true);
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenCreatedDateTime: string;
      capturedAt: string;
    };
    expect(snapshot.lastSeenCreatedDateTime).toBe("2026-05-23T12:00:00Z");
    expect(typeof snapshot.capturedAt).toBe("string");
    expect(snapshot.capturedAt.length).toBeGreaterThan(0);

    // notebookId + sectionId are echoed in the patch.
    expect((result as Record<string, unknown>).notebookId).toBe("nb-1");
    expect((result as Record<string, unknown>).sectionId).toBe("sec-1");
  });
});

describe("new_note activate — empty section (first-poll-miss empty branch)", () => {
  it("seeds snapshot with current wall-clock ISO when section is empty", async () => {
    mockPagesList.mockResolvedValueOnce({ pages: [], nextLink: null });
    const before = Date.now();
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    const after = Date.now();
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenCreatedDateTime: string;
      capturedAt: string;
    };
    // Seed is an ISO timestamp from the activation window.
    const seedMs = Date.parse(snapshot.lastSeenCreatedDateTime);
    expect(seedMs).toBeGreaterThanOrEqual(before);
    expect(seedMs).toBeLessThanOrEqual(after);
  });

  it("seeds wall-clock when newest page is missing createdDateTime", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [{ id: "p-1" /* no createdDateTime */ }],
      nextLink: null,
    });
    const before = Date.now();
    const result = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    const after = Date.now();
    const snapshot = (result as Record<string, unknown>).snapshot as {
      lastSeenCreatedDateTime: string;
    };
    const seedMs = Date.parse(snapshot.lastSeenCreatedDateTime);
    expect(seedMs).toBeGreaterThanOrEqual(before);
    expect(seedMs).toBeLessThanOrEqual(after);
  });
});

describe("new_note activate — re-activation idempotency", () => {
  it("each call re-seeds from CURRENT newest page (no replay of disabled-window pages)", async () => {
    mockPagesList.mockResolvedValueOnce({
      pages: [
        { id: "p-old", createdDateTime: "2026-05-22T00:00:00Z" },
      ],
      nextLink: null,
    });
    const first = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(
      ((first as Record<string, unknown>).snapshot as { lastSeenCreatedDateTime: string })
        .lastSeenCreatedDateTime,
    ).toBe("2026-05-22T00:00:00Z");

    mockPagesList.mockResolvedValueOnce({
      pages: [
        { id: "p-newer", createdDateTime: "2026-05-23T12:00:00Z" },
      ],
      nextLink: null,
    });
    const second = await activate({
      node: baseNode,
      integration,
      workflowId: "wf-1",
    });
    expect(
      ((second as Record<string, unknown>).snapshot as { lastSeenCreatedDateTime: string })
        .lastSeenCreatedDateTime,
    ).toBe("2026-05-23T12:00:00Z");
  });
});
