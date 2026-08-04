/**
 * @jest-environment node
 *
 * microsoft-onenote options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftOneNoteNotebooksResolver } from "@/integrations/microsoft-onenote/options/notebooks";
import { IntegrationActionRequiredError, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { microsoftOneNotePagesResolver } from "@/integrations/microsoft-onenote/options/pages";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { microsoftOneNoteSectionsResolver } from "@/integrations/microsoft-onenote/options/sections";
import { microsoftOneNoteTargetSectionsResolver } from "@/integrations/microsoft-onenote/options/targetSections";

// ---------------------------------------------------------------------------
// Merged from the former notebooks.test.ts
// Tests for `integrations/microsoft-onenote/options/notebooks.ts` —
// Slice 3.ONENOTE-3.
// Pin:
// - Shape: no requiredDeps, requiresIntegration=true, provider key.
// - Wrapper invocation via notebooksList with orderBy=displayName asc,
// top=100, accountId pinned to integration.providerAccountId.
// - refreshAndRetry uses provider="microsoft-onenote".
// - Mapping (id → value, displayName → label, lastModifiedDateTime →
// "Modified YYYY-MM-DD" description).
// - Empty response → empty items.
// - Drops notebooks with missing/empty id.
// - Falls back to id when displayName missing/empty.
// - hasMore reflects nextLink presence.
// - Case-insensitive q filter against label.
// - Error sanitization (Unauthorized401, IntegrationActionRequired,
// generic — no raw Graph body leak).
// - null integration → INTEGRATION_DISCONNECTED, no API call.
// ---------------------------------------------------------------------------
describe("notebooks (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-onenote",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (OneNote)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-23T12:00:00Z",
  scopes: ["offline_access", "Notes.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftOneNoteNotebooksResolver — shape", () => {
  it("declares no requiredDeps and requires an integration", () => {
    expect(microsoftOneNoteNotebooksResolver.source).toBe(
      "microsoft-onenote:notebooks",
    );
    expect(microsoftOneNoteNotebooksResolver.provider).toBe(
      "microsoft-onenote",
    );
    expect(microsoftOneNoteNotebooksResolver.requiresIntegration).toBe(true);
    expect(microsoftOneNoteNotebooksResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftOneNoteNotebooksResolver — wrapper invocation", () => {
  it("calls refreshAndRetry pinned to provider=microsoft-onenote + accountId=integration.providerAccountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ notebooks: [], nextLink: null });
    await microsoftOneNoteNotebooksResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.accountId).toBe("acct-user-1");
    expect(args.provider).toBe("microsoft-onenote");
    expect(args.providerAccountId).toBe("alice@contoso.com");
    expect(typeof args.apiCall).toBe("function");
  });

  it("threads orderBy=displayName asc + top=100 into the Graph URL", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    await microsoftOneNoteNotebooksResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/onenote/notebooks");
    const params = new URL(url).searchParams;
    expect(params.get("$orderby")).toBe("displayName asc");
    expect(params.get("$top")).toBe("100");
    fetchSpy.mockRestore();
  });
});

describe("microsoftOneNoteNotebooksResolver — mapping", () => {
  it("maps id → value, displayName → label, lastModifiedDateTime → 'Modified YYYY-MM-DD' description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        {
          id: "nb-1",
          displayName: "Work",
          lastModifiedDateTime: "2026-05-22T14:30:00Z",
        },
        {
          id: "nb-2",
          displayName: "Personal",
          lastModifiedDateTime: "2026-04-01T09:00:00Z",
        },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "nb-1", label: "Work", description: "Modified 2026-05-22" },
      { value: "nb-2", label: "Personal", description: "Modified 2026-04-01" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when lastModifiedDateTime is missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [{ id: "nb-1", displayName: "Work" }],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "nb-1", label: "Work" }]);
  });

  it("omits description when lastModifiedDateTime is not ISO-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        {
          id: "nb-1",
          displayName: "Work",
          lastModifiedDateTime: "not-a-date",
        },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "nb-1", label: "Work" }]);
  });

  it("falls back to id when displayName is missing or empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        { id: "nb-1" },
        { id: "nb-2", displayName: "" },
        { id: "nb-3", displayName: "Named" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "nb-1", label: "nb-1" },
      { value: "nb-2", label: "nb-2" },
      { value: "nb-3", label: "Named" },
    ]);
  });

  it("drops notebooks with missing or empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        { displayName: "No id" },
        { id: "", displayName: "Empty id" },
        { id: "nb-good", displayName: "Good" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["nb-good"]);
  });

  it("returns empty items when notebooks array is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ notebooks: [], nextLink: null });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [
        { id: "nb-1", displayName: "Work Notes" },
        { id: "nb-2", displayName: "Personal Notes" },
        { id: "nb-3", displayName: "Recipes" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(
      ctx({ q: "NOTES" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["nb-1", "nb-2"]);
  });

  it("hasMore=true when nextLink is set", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      notebooks: [{ id: "nb-1", displayName: "Work" }],
      nextLink: "https://graph.microsoft.com/v1.0/me/onenote/notebooks?$skip=100",
    });
    const result = await microsoftOneNoteNotebooksResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("microsoftOneNoteNotebooksResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null, no API call", async () => {
    await expect(
      microsoftOneNoteNotebooksResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED with reconnect prompt", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-onenote",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    try {
      await microsoftOneNoteNotebooksResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe(
        "INTEGRATION_DISCONNECTED",
      );
      expect((err as Error).message).toContain("Reconnect");
    }
  });

  it("maps Unauthorized401Error (defense in depth) → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftOneNoteNotebooksResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'Microsoft Graph me/onenote/notebooks GET failed: {"raw":"onenote-secret-token-leak"}',
      ),
    );
    try {
      await microsoftOneNoteNotebooksResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("onenote-secret-token-leak");
      expect(msg).not.toContain("raw");
      expect(msg).not.toContain("Bearer");
      expect(msg).not.toContain("decrypted-token");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pages.test.ts
// Tests for `integrations/microsoft-onenote/options/pages.ts` —
// Slice 3.ONENOTE-3.
// Pin:
// - Shape: requiredDeps=["sectionId"], requiresIntegration=true.
// - Wrapper invocation via pagesList with sectionId=ctx.deps.sectionId,
// orderBy=lastModifiedDateTime desc, top=100.
// - refreshAndRetry pinned to integration.providerAccountId.
// - Mapping (id → value, title → label, lastModifiedDateTime →
// "Modified YYYY-MM-DD" description).
// - Falls back to id when title missing.
// - Drops pages with missing/empty id.
// - MISSING_DEPENDENCY when ctx.deps.sectionId is empty / missing.
// - NotFoundError (parent section gone) → empty items (NOT throw).
// - hasMore reflects nextLink presence.
// - Case-insensitive q filter.
// - Error sanitization (no raw Graph body leak).
// ---------------------------------------------------------------------------
describe("pages (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-onenote",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (OneNote)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-23T12:00:00Z",
  scopes: ["offline_access", "Notes.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { sectionId: "sec-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftOneNotePagesResolver — shape", () => {
  it("declares requiredDeps=['sectionId'] (camelCase, V1-preserved) and requires an integration", () => {
    expect(microsoftOneNotePagesResolver.source).toBe("microsoft-onenote:pages");
    expect(microsoftOneNotePagesResolver.provider).toBe("microsoft-onenote");
    expect(microsoftOneNotePagesResolver.requiresIntegration).toBe(true);
    expect(microsoftOneNotePagesResolver.requiredDeps).toEqual(["sectionId"]);
  });
});

describe("microsoftOneNotePagesResolver — wrapper invocation", () => {
  it("threads sectionId + orderBy=lastModifiedDateTime desc + top=100 into the pagesList call", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    await microsoftOneNotePagesResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/onenote/sections/sec-1/pages");
    const params = new URL(url).searchParams;
    expect(params.get("$orderby")).toBe("lastModifiedDateTime desc");
    expect(params.get("$top")).toBe("100");
    fetchSpy.mockRestore();
  });

  it("pins refreshAndRetry accountId to integration.providerAccountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ pages: [], nextLink: null });
    await microsoftOneNotePagesResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-onenote");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftOneNotePagesResolver — mapping", () => {
  it("maps id → value, title → label, lastModifiedDateTime → 'Modified YYYY-MM-DD' description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        {
          id: "p-1",
          title: "Sprint planning",
          lastModifiedDateTime: "2026-05-22T14:30:00Z",
        },
        {
          id: "p-2",
          title: "Retro",
          lastModifiedDateTime: "2026-05-01T09:00:00Z",
        },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "p-1", label: "Sprint planning", description: "Modified 2026-05-22" },
      { value: "p-2", label: "Retro", description: "Modified 2026-05-01" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when lastModifiedDateTime is missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [{ id: "p-1", title: "Untitled-ish" }],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "p-1", label: "Untitled-ish" }]);
  });

  it("omits description when lastModifiedDateTime is not ISO-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        { id: "p-1", title: "Bad date", lastModifiedDateTime: "yesterday" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "p-1", label: "Bad date" }]);
  });

  it("falls back to id when title is missing or empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        { id: "p-1" },
        { id: "p-2", title: "" },
        { id: "p-3", title: "Named" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items.map((i) => ({ v: i.value, l: i.label }))).toEqual([
      { v: "p-1", l: "p-1" },
      { v: "p-2", l: "p-2" },
      { v: "p-3", l: "Named" },
    ]);
  });

  it("drops pages with missing or empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        { title: "No id" },
        { id: "", title: "Empty id" },
        { id: "p-good", title: "Good" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["p-good"]);
  });

  it("returns empty items when pages array is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ pages: [], nextLink: null });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [
        { id: "p1", title: "Sprint planning" },
        { id: "p2", title: "Sprint retro" },
        { id: "p3", title: "Recipe ideas" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNotePagesResolver.resolve(
      ctx({ q: "SPRINT" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["p1", "p2"]);
  });

  it("hasMore=true when nextLink is set", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      pages: [{ id: "p1", title: "First" }],
      nextLink: "https://graph.microsoft.com/v1.0/me/onenote/...?$skip=100",
    });
    const result = await microsoftOneNotePagesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("microsoftOneNotePagesResolver — dependency + cascade-fallback handling", () => {
  it("throws MISSING_DEPENDENCY when ctx.deps.sectionId is empty, no API call", async () => {
    await expect(
      microsoftOneNotePagesResolver.resolve(ctx({ deps: { sectionId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when ctx.deps.sectionId is missing, no API call", async () => {
    await expect(
      microsoftOneNotePagesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent section gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError(
        "onenote pages for section sec-ghost",
        "Item not found",
      ),
    );
    const result = await microsoftOneNotePagesResolver.resolve(
      ctx({ deps: { sectionId: "sec-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftOneNotePagesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null, no API call", async () => {
    await expect(
      microsoftOneNotePagesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED with reconnect prompt", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-onenote",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    try {
      await microsoftOneNotePagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe(
        "INTEGRATION_DISCONNECTED",
      );
      expect((err as Error).message).toContain("Reconnect");
    }
  });

  it("maps Unauthorized401Error (defense in depth) → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftOneNotePagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'Microsoft Graph me/onenote/sections/{id}/pages GET failed: {"raw":"pages-secret-leak"}',
      ),
    );
    try {
      await microsoftOneNotePagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("pages-secret-leak");
      expect(msg).not.toContain("raw");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former sections.test.ts
// Tests for `integrations/microsoft-onenote/options/sections.ts` —
// Slice 3.ONENOTE-3.
// Pin:
// - Shape: requiredDeps=["notebookId"], requiresIntegration=true.
// - Wrapper invocation via sectionsList with notebookId=ctx.deps.notebookId,
// orderBy=displayName asc, top=100.
// - refreshAndRetry pinned to integration.providerAccountId.
// - Mapping (id → value, displayName → label, no description per design).
// - Drops sections with missing/empty id.
// - MISSING_DEPENDENCY when ctx.deps.notebookId is empty / missing.
// - NotFoundError (parent notebook gone) → empty items (NOT throw).
// - hasMore reflects nextLink presence.
// - Case-insensitive q filter.
// - Error sanitization.
// ---------------------------------------------------------------------------
describe("sections (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-onenote",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (OneNote)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-23T12:00:00Z",
  scopes: ["offline_access", "Notes.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { notebookId: "nb-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftOneNoteSectionsResolver — shape", () => {
  it("declares requiredDeps=['notebookId'] (camelCase, V1-preserved) and requires an integration", () => {
    expect(microsoftOneNoteSectionsResolver.source).toBe(
      "microsoft-onenote:sections",
    );
    expect(microsoftOneNoteSectionsResolver.provider).toBe("microsoft-onenote");
    expect(microsoftOneNoteSectionsResolver.requiresIntegration).toBe(true);
    expect(microsoftOneNoteSectionsResolver.requiredDeps).toEqual([
      "notebookId",
    ]);
  });
});

describe("microsoftOneNoteSectionsResolver — wrapper invocation", () => {
  it("threads notebookId + orderBy=displayName asc + top=100 into the sectionsList call", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    await microsoftOneNoteSectionsResolver.resolve(ctx());
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/onenote/notebooks/nb-1/sections");
    const params = new URL(url).searchParams;
    expect(params.get("$orderby")).toBe("displayName asc");
    expect(params.get("$top")).toBe("100");
    fetchSpy.mockRestore();
  });

  it("pins refreshAndRetry accountId to integration.providerAccountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ sections: [], nextLink: null });
    await microsoftOneNoteSectionsResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-onenote");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftOneNoteSectionsResolver — mapping", () => {
  it("maps id → value, displayName → label (no description per design)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [
        {
          id: "sec-1",
          displayName: "Meeting Notes",
          lastModifiedDateTime: "2026-05-22T14:30:00Z",
        },
        { id: "sec-2", displayName: "Ideas" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "sec-1", label: "Meeting Notes" },
      { value: "sec-2", label: "Ideas" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to id when displayName is missing or empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [{ id: "sec-1" }, { id: "sec-2", displayName: "" }],
      nextLink: null,
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "sec-1", label: "sec-1" },
      { value: "sec-2", label: "sec-2" },
    ]);
  });

  it("drops sections with missing or empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [
        { displayName: "No id" },
        { id: "", displayName: "Empty id" },
        { id: "sec-good", displayName: "Good" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["sec-good"]);
  });

  it("returns empty items when sections array is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ sections: [], nextLink: null });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [
        { id: "s1", displayName: "Meeting Notes" },
        { id: "s2", displayName: "Personal Notes" },
        { id: "s3", displayName: "Recipes" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(
      ctx({ q: "NOTES" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["s1", "s2"]);
  });

  it("hasMore=true when nextLink is set", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      sections: [{ id: "s1", displayName: "First" }],
      nextLink: "https://graph.microsoft.com/v1.0/me/onenote/...?$skip=100",
    });
    const result = await microsoftOneNoteSectionsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("microsoftOneNoteSectionsResolver — dependency + cascade-fallback handling", () => {
  it("throws MISSING_DEPENDENCY when ctx.deps.notebookId is empty, no API call", async () => {
    await expect(
      microsoftOneNoteSectionsResolver.resolve(ctx({ deps: { notebookId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when ctx.deps.notebookId is missing, no API call", async () => {
    await expect(
      microsoftOneNoteSectionsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent notebook gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError(
        "onenote sections for notebook nb-ghost",
        "Item not found",
      ),
    );
    const result = await microsoftOneNoteSectionsResolver.resolve(
      ctx({ deps: { notebookId: "nb-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftOneNoteSectionsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null, no API call", async () => {
    await expect(
      microsoftOneNoteSectionsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED with reconnect prompt", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-onenote",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    try {
      await microsoftOneNoteSectionsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe(
        "INTEGRATION_DISCONNECTED",
      );
      expect((err as Error).message).toContain("Reconnect");
    }
  });

  it("maps Unauthorized401Error (defense in depth) → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftOneNoteSectionsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'Microsoft Graph me/onenote/notebooks/{id}/sections GET failed: {"raw":"sections-secret-leak"}',
      ),
    );
    try {
      await microsoftOneNoteSectionsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("sections-secret-leak");
      expect(msg).not.toContain("raw");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former targetSections.test.ts
// Tests for `integrations/microsoft-onenote/options/targetSections.ts` —
// RESOLVERS-1. Flat all-notebooks section picker ("Notebook › Section")
// backing `copy_page.targetSectionId`. Dep-less by design: the copy_page
// runtime schema is `.strict()`, so a `targetNotebookId` cascade parent
// was rejected — this resolver needs zero runtime-schema changes.
// ---------------------------------------------------------------------------
describe("targetSections (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-onenote",
  providerAccountId: "ada@contoso.com",
  displayName: "Ada (OneNote)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-07-15T12:00:00Z",
  scopes: ["offline_access", "Notes.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-14T00:00:00Z",
  updatedAt: "2026-07-14T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: {},
    ...overrides,
  };
}

function section(
  id: string,
  displayName: string | undefined,
  notebookName?: string,
) {
  return {
    id,
    displayName,
    ...(notebookName !== undefined
      ? { parentNotebook: { id: `nb-${notebookName}`, displayName: notebookName } }
      : {}),
  };
}

function sections(list: unknown[], nextLink: string | null = null) {
  return { sections: list, nextLink };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftOneNoteTargetSectionsResolver — shape", () => {
  it("is the dep-less all-notebooks section picker and requires an integration", () => {
    expect(microsoftOneNoteTargetSectionsResolver.source).toBe(
      "microsoft-onenote:target_sections",
    );
    expect(microsoftOneNoteTargetSectionsResolver.provider).toBe(
      "microsoft-onenote",
    );
    expect(microsoftOneNoteTargetSectionsResolver.requiresIntegration).toBe(
      true,
    );
    expect(microsoftOneNoteTargetSectionsResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftOneNoteTargetSectionsResolver — mapping", () => {
  it("labels items 'Notebook › Section', sorted alphabetically by label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      sections([
        section("sec-2", "Recipes", "Personal"),
        section("sec-1", "Meeting notes", "Work"),
        section("sec-3", "Archive", "Personal"),
      ]),
    );
    const result = await microsoftOneNoteTargetSectionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "sec-3", label: "Personal › Archive" },
      { value: "sec-2", label: "Personal › Recipes" },
      { value: "sec-1", label: "Work › Meeting notes" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to the section name alone when parentNotebook is missing, and to the id when nameless; skips id-less rows", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      sections([
        section("sec-1", "Loose section"),
        section("sec-2", undefined),
        { displayName: "No id" },
      ]),
    );
    const result = await microsoftOneNoteTargetSectionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "sec-1", label: "Loose section" },
      { value: "sec-2", label: "sec-2" },
    ]);
  });

  it("q filter matches notebook OR section name (both live in the label), case-insensitive; hasMore honest from nextLink", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      sections(
        [
          section("sec-1", "Meeting notes", "Work"),
          section("sec-2", "Recipes", "Personal"),
        ],
        "https://graph/next",
      ),
    );
    const byNotebook = await microsoftOneNoteTargetSectionsResolver.resolve(
      ctx({ q: "WORK" }),
    );
    expect(byNotebook.items.map((i) => i.value)).toEqual(["sec-1"]);
    expect(byNotebook.hasMore).toBe(true);

    mockRefreshAndRetry.mockResolvedValueOnce(
      sections([
        section("sec-1", "Meeting notes", "Work"),
        section("sec-2", "Recipes", "Personal"),
      ]),
    );
    const bySection = await microsoftOneNoteTargetSectionsResolver.resolve(
      ctx({ q: "recipes" }),
    );
    expect(bySection.items.map((i) => i.value)).toEqual(["sec-2"]);
  });

  it("labels never carry page content, emails, or raw ids beyond the fallback", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      sections([
        {
          ...section("sec-1", "Notes", "Work"),
          pagesUrl: "https://graph.microsoft.com/secret-pages-url",
          createdBy: { user: { email: "ada@contoso.com" } },
        },
      ]),
    );
    const result = await microsoftOneNoteTargetSectionsResolver.resolve(ctx());
    const flat = JSON.stringify(result.items);
    expect(flat).not.toContain("@contoso.com");
    expect(flat).not.toContain("secret-pages-url");
  });
});

describe("microsoftOneNoteTargetSectionsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftOneNoteTargetSectionsResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-onenote",
        providerAccountId: "ada@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftOneNoteTargetSectionsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftOneNoteTargetSectionsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph bodies or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('sections GET failed: {"secret":"raw-graph-body"} Bearer xyz'),
    );
    try {
      await microsoftOneNoteTargetSectionsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("raw-graph-body");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});
