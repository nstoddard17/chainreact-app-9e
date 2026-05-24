/**
 * Slice 3.GDOCS-4 integration test — Google Docs `update_document`
 * config shape as it flows into the WorkflowBuilder shell.
 *
 * Pins the runtime-schema parity, Q11 honest-state behavior on
 * `insertLocation` (required, no default), and the replace-mode
 * warning. Field-name preservation is enforced through this test:
 * any rename in the runtime schema OR meta drifts both ways trip the
 * camelCase assertions.
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

import { googleDocsUpdateDocumentMeta } from "@/integrations/google-docs/actions/updateDocument.meta";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeTriggers.mockReset();
  mockListProviderActions.mockReset();
  mockListProviderTriggers.mockReset();
  mockFetchOptionsSource.mockReset();
});

describe("Google Docs update_document meta — Builder shape", () => {
  it("preserves runtime camelCase field names verbatim (documentId / content / insertLocation / searchText)", () => {
    expect(googleDocsUpdateDocumentMeta.fields.map((f) => f.name)).toEqual([
      "documentId",
      "content",
      "insertLocation",
      "searchText",
    ]);
  });

  it("documentId picker wires google-docs:documents with NO deps", () => {
    const field = googleDocsUpdateDocumentMeta.fields.find(
      (f) => f.name === "documentId",
    )!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("google-docs:documents");
    expect(field.dependsOn).toBeUndefined();
    expect(field.required).toBe(true);
  });

  it("content is textarea + required", () => {
    const field = googleDocsUpdateDocumentMeta.fields.find(
      (f) => f.name === "content",
    )!;
    expect(field.type).toBe("textarea");
    expect(field.required).toBe(true);
  });

  it("Q11 — insertLocation is required with NO default; 5-value V1 enum preserved", () => {
    const field = googleDocsUpdateDocumentMeta.fields.find(
      (f) => f.name === "insertLocation",
    )!;
    expect(field.type).toBe("select");
    expect(field.required).toBe(true);
    expect(field.defaultValue).toBeUndefined();
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "after_text",
      "before_text",
      "beginning",
      "end",
      "replace",
    ]);
  });

  it("searchText is optional text (schema enforces required-when-after-text/before-text at runtime)", () => {
    const field = googleDocsUpdateDocumentMeta.fields.find(
      (f) => f.name === "searchText",
    )!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(false);
  });

  it("risk: medium, not destructive, no confirmation (per D-GD4 — replace mode recoverable via Docs version history)", () => {
    expect(googleDocsUpdateDocumentMeta.riskLevel).toBe("medium");
    expect(googleDocsUpdateDocumentMeta.isDestructive).toBe(false);
    expect(googleDocsUpdateDocumentMeta.requiresConfirmation).toBe(false);
  });

  it("description carries the replace-mode + Version-history warning", () => {
    const desc = googleDocsUpdateDocumentMeta.description;
    expect(desc).toMatch(/replace.*wipes/i);
    expect(desc).toMatch(/version history/i);
  });

  it("description explains wildcard `*` semantics for after_text / before_text", () => {
    expect(googleDocsUpdateDocumentMeta.description).toMatch(/wildcard/i);
  });
});

describe("Google Docs update_document meta — output shape", () => {
  it("output names match the runtime handler (documentId / documentUrl / title / updatedAt / revisionId / contentLength / insertionLocation)", () => {
    expect(googleDocsUpdateDocumentMeta.outputs.map((o) => o.name)).toEqual([
      "documentId",
      "documentUrl",
      "title",
      "updatedAt",
      "revisionId",
      "contentLength",
      "insertionLocation",
    ]);
  });

  it("documentUrl + title sensitive; revisionId / contentLength / insertionLocation NOT sensitive", () => {
    const out = new Map(
      googleDocsUpdateDocumentMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("documentUrl")?.sensitive).toBe(true);
    expect(out.get("title")?.sensitive).toBe(true);
    expect(out.get("revisionId")?.sensitive).toBeUndefined();
    expect(out.get("contentLength")?.sensitive).toBeUndefined();
    expect(out.get("insertionLocation")?.sensitive).toBeUndefined();
  });

  it("output intentionally OMITS the inserted body content (only contentLength is surfaced)", () => {
    const names = googleDocsUpdateDocumentMeta.outputs.map((o) => o.name);
    expect(names).not.toContain("content");
    expect(names).not.toContain("body");
  });
});
