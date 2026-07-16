/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-onenote/options/targetSections.ts` —
 * RESOLVERS-1. Flat all-notebooks section picker ("Notebook › Section")
 * backing `copy_page.targetSectionId`. Dep-less by design: the copy_page
 * runtime schema is `.strict()`, so a `targetNotebookId` cascade parent
 * was rejected — this resolver needs zero runtime-schema changes.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftOneNoteTargetSectionsResolver } from "@/integrations/microsoft-onenote/options/targetSections";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

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
