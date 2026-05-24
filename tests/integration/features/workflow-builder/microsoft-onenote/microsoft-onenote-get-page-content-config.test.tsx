/**
 * Slice 3.ONENOTE-4 integration test — OneNote `get_page_content`
 * config shape as it flows into the WorkflowBuilder shell.
 *
 * Pins the 3-level cascade chain (notebookId → sectionId → pageId),
 * the **camelCase boolean field name preservation** (`includeIDs` +
 * `preGenerated` are V1-preserved verbatim — NOT normalized to
 * `include_ids` / `pre_generated`), and the `content`-sensitive output
 * marking (page body is bulk PII; matches the structural
 * suspicious-name guard).
 */

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn();
const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { microsoftOneNoteGetPageContentMeta } from "@/integrations/microsoft-onenote/actions/getPageContent.meta";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeTriggers.mockReset();
  mockListProviderActions.mockReset();
  mockListProviderTriggers.mockReset();
  mockFetchOptionsSource.mockReset();
});

describe("OneNote get_page_content meta — Builder shape", () => {
  it("preserves camelCase field names verbatim INCLUDING boolean fields (notebookId / sectionId / pageId / includeIDs / preGenerated)", () => {
    expect(
      microsoftOneNoteGetPageContentMeta.fields.map((f) => f.name),
    ).toEqual([
      "notebookId",
      "sectionId",
      "pageId",
      "includeIDs",
      "preGenerated",
    ]);
  });

  it("camelCase booleans are NOT normalized to snake_case (regression guard)", () => {
    const names = microsoftOneNoteGetPageContentMeta.fields.map((f) => f.name);
    expect(names).not.toContain("include_ids");
    expect(names).not.toContain("pre_generated");
    expect(names).toContain("includeIDs");
    expect(names).toContain("preGenerated");
  });

  it("3-level cascade chain: notebookId → sectionId → pageId, every level required", () => {
    const nb = microsoftOneNoteGetPageContentMeta.fields.find(
      (f) => f.name === "notebookId",
    )!;
    const sec = microsoftOneNoteGetPageContentMeta.fields.find(
      (f) => f.name === "sectionId",
    )!;
    const pg = microsoftOneNoteGetPageContentMeta.fields.find(
      (f) => f.name === "pageId",
    )!;
    expect(nb.optionsSource).toBe("microsoft-onenote:notebooks");
    expect(nb.dependsOn).toBeUndefined();
    expect(sec.optionsSource).toBe("microsoft-onenote:sections");
    expect(sec.dependsOn).toBe("notebookId");
    expect(pg.optionsSource).toBe("microsoft-onenote:pages");
    expect(pg.dependsOn).toBe("sectionId");
    expect([nb.required, sec.required, pg.required]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("includeIDs is boolean + optional + defaults false (matches schema)", () => {
    const field = microsoftOneNoteGetPageContentMeta.fields.find(
      (f) => f.name === "includeIDs",
    )!;
    expect(field.type).toBe("boolean");
    expect(field.required).toBe(false);
    expect(field.defaultValue).toBe(false);
  });

  it("preGenerated is boolean + optional + defaults true (matches schema — Graph perf hint)", () => {
    const field = microsoftOneNoteGetPageContentMeta.fields.find(
      (f) => f.name === "preGenerated",
    )!;
    expect(field.type).toBe("boolean");
    expect(field.required).toBe(false);
    expect(field.defaultValue).toBe(true);
  });

  it("description explains includeIDs is load-bearing for chaining into update_page insert mode", () => {
    const desc = microsoftOneNoteGetPageContentMeta.description;
    expect(desc).toMatch(/includeIDs.*insert|insert.*includeIDs/i);
    expect(desc).toMatch(/data-id/i);
  });

  it("description notes preGenerated trade-off (cached vs fresh)", () => {
    expect(microsoftOneNoteGetPageContentMeta.description).toMatch(
      /cached|preauthenticated|stale/i,
    );
  });

  it("risk: low (pure read)", () => {
    expect(microsoftOneNoteGetPageContentMeta.riskLevel).toBe("low");
    expect(microsoftOneNoteGetPageContentMeta.isDestructive).toBe(false);
    expect(microsoftOneNoteGetPageContentMeta.requiresConfirmation).toBe(false);
  });
});

describe("OneNote get_page_content meta — output shape", () => {
  it("output names match runtime handler", () => {
    expect(
      microsoftOneNoteGetPageContentMeta.outputs.map((o) => o.name),
    ).toEqual([
      "id",
      "title",
      "content",
      "contentUrl",
      "webUrl",
      "createdDateTime",
      "lastModifiedDateTime",
      "level",
    ]);
  });

  it("content + title + contentUrl + webUrl marked sensitive (bulk PII + addressable URLs)", () => {
    const out = new Map(
      microsoftOneNoteGetPageContentMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("content")?.sensitive).toBe(true);
    expect(out.get("title")?.sensitive).toBe(true);
    expect(out.get("contentUrl")?.sensitive).toBe(true);
    expect(out.get("webUrl")?.sensitive).toBe(true);
  });

  it("id + timestamps + level NOT sensitive (opaque / structural)", () => {
    const out = new Map(
      microsoftOneNoteGetPageContentMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("id")?.sensitive).toBeUndefined();
    expect(out.get("createdDateTime")?.sensitive).toBeUndefined();
    expect(out.get("lastModifiedDateTime")?.sensitive).toBeUndefined();
    expect(out.get("level")?.sensitive).toBeUndefined();
  });
});
