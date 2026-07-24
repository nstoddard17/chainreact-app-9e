/**
 * Slice 3.ONENOTE-4 integration test — OneNote `delete_page` config
 * shape as it flows into the WorkflowBuilder shell.
 *
 * Pins the destructive trio (`isDestructive: true` +
 * `requiresConfirmation: true` + `riskLevel: "high"`), the 3-level
 * cascade chain (notebookId → sectionId → pageId), and the structural
 * output guarantee — NO title / body / content echoed post-delete
 * (defense in depth against accidental PII echo on a destructive
 * write).
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
  listAiActions: () => Promise.resolve([]),
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

import { microsoftOneNoteDeletePageMeta } from "@/integrations/microsoft-onenote/actions/deletePage.meta";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeTriggers.mockReset();
  mockListProviderActions.mockReset();
  mockListProviderTriggers.mockReset();
  mockFetchOptionsSource.mockReset();
});

describe("OneNote delete_page meta — Builder shape (destructive trio)", () => {
  it("declares FULL destructive trio: isDestructive + requiresConfirmation + riskLevel:high", () => {
    expect(microsoftOneNoteDeletePageMeta.isDestructive).toBe(true);
    expect(microsoftOneNoteDeletePageMeta.requiresConfirmation).toBe(true);
    expect(microsoftOneNoteDeletePageMeta.riskLevel).toBe("high");
    expect(microsoftOneNoteDeletePageMeta.riskDescription).toBeDefined();
  });

  it("riskDescription explains Graph has no recycle-bin endpoint", () => {
    const rd = microsoftOneNoteDeletePageMeta.riskDescription!.toLowerCase();
    expect(rd).toMatch(/recycle|cannot|recovery|irreversible/);
  });

  it("preserves camelCase field names verbatim (notebookId / sectionId / pageId)", () => {
    expect(microsoftOneNoteDeletePageMeta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "pageId",
    ]);
  });

  it("3-level cascade chain: notebookId → sectionId → pageId, every level required", () => {
    const nb = microsoftOneNoteDeletePageMeta.fields.find(
      (f) => f.name === "notebookId",
    )!;
    const sec = microsoftOneNoteDeletePageMeta.fields.find(
      (f) => f.name === "sectionId",
    )!;
    const pg = microsoftOneNoteDeletePageMeta.fields.find(
      (f) => f.name === "pageId",
    )!;
    expect(nb.optionsSource).toBe("microsoft-onenote:notebooks");
    expect(nb.dependsOn).toBeUndefined();
    expect(nb.required).toBe(true);
    expect(sec.optionsSource).toBe("microsoft-onenote:sections");
    expect(sec.dependsOn).toBe("notebookId");
    expect(sec.required).toBe(true);
    expect(pg.optionsSource).toBe("microsoft-onenote:pages");
    expect(pg.dependsOn).toBe("sectionId");
    expect(pg.required).toBe(true);
  });

  it("description warns about irreversibility + no Graph recycle-bin", () => {
    expect(microsoftOneNoteDeletePageMeta.description).toMatch(
      /irreversible|destructive/i,
    );
    expect(microsoftOneNoteDeletePageMeta.description).toMatch(
      /recycle.bin|recovery/i,
    );
  });
});

describe("OneNote delete_page meta — output shape (no PII echo)", () => {
  it("output is STRUCTURAL only — exactly { success, deletedPageId, deletedAt }", () => {
    const names = microsoftOneNoteDeletePageMeta.outputs
      .map((o) => o.name)
      .sort();
    expect(names).toEqual(["deletedAt", "deletedPageId", "success"]);
  });

  it("output does NOT echo title / body / content / messages (defense-in-depth — destructive write)", () => {
    const names = microsoftOneNoteDeletePageMeta.outputs.map((o) => o.name);
    for (const banned of ["title", "body", "content", "messages", "text"]) {
      expect(names).not.toContain(banned);
    }
  });

  it("deletedPageId / deletedAt / success NOT sensitive (opaque + structural)", () => {
    const out = new Map(
      microsoftOneNoteDeletePageMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("deletedPageId")?.sensitive).toBeUndefined();
    expect(out.get("deletedAt")?.sensitive).toBeUndefined();
    expect(out.get("success")?.sensitive).toBeUndefined();
  });
});
