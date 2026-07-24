/**
 * Slice 3.GDOCS-4 integration test — Google Docs `create_document`
 * config shape as it flows into the WorkflowBuilder shell.
 *
 * Mirrors the Discord meta-shape pinning pattern under
 * `tests/integration/features/workflow-builder/discord/`. Verifies
 * the meta the Builder consumes is correctly shaped — covers
 * field-name preservation, runtime-schema parity, folder-resolver
 * cross-product wiring, sensitive-output flags. The end-to-end click-
 * through path (real Builder render + drafts/persistence) is exercised
 * by the existing Builder integration suite at the
 * google-sheets-append-row level; for the Google Docs arc the surface
 * is well-covered by:
 *   - `tests/unit/integrations/google-docs/discoveryRegistry.test.ts`
 *     (meta semantics)
 *   - `tests/unit/app/api/providers/providers-route.test.ts`
 *     (wire shape through the route)
 * This file pins the meta as the Builder import path consumes it, so
 * a renamed export / drifted field name fails here before the route
 * test runs.
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

import { googleDocsCreateDocumentMeta } from "@/integrations/google-docs/actions/createDocument.meta";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeTriggers.mockReset();
  mockListProviderActions.mockReset();
  mockListProviderTriggers.mockReset();
  mockFetchOptionsSource.mockReset();
});

describe("Google Docs create_document meta — Builder shape", () => {
  it("preserves runtime camelCase field names verbatim (title / content / folderId)", () => {
    expect(googleDocsCreateDocumentMeta.fields.map((f) => f.name)).toEqual([
      "title",
      "content",
      "folderId",
    ]);
  });

  it("title is text + required (no default)", () => {
    const field = googleDocsCreateDocumentMeta.fields.find(
      (f) => f.name === "title",
    )!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(true);
    expect(field.defaultValue).toBeUndefined();
  });

  it("content is textarea + optional (workflow may create an empty doc)", () => {
    const field = googleDocsCreateDocumentMeta.fields.find(
      (f) => f.name === "content",
    )!;
    expect(field.type).toBe("textarea");
    expect(field.required).toBe(false);
  });

  it("folderId picker wires google-drive:folders (cross-product resolver from GDOCS-3) with NO deps", () => {
    const field = googleDocsCreateDocumentMeta.fields.find(
      (f) => f.name === "folderId",
    )!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("google-drive:folders");
    expect(field.dependsOn).toBeUndefined();
    expect(field.required).toBe(false);
  });

  it("declares NO file-upload field (D-GD1 — content_source: file_upload mode deferred from V1)", () => {
    const names = googleDocsCreateDocumentMeta.fields.map((f) => f.name);
    expect(names).not.toContain("contentSource");
    expect(names).not.toContain("uploadedFile");
    expect(names).not.toContain("file");
  });

  it("declares NO sharing fields (moved to share_document per GDOCS-1 §3.1)", () => {
    const names = googleDocsCreateDocumentMeta.fields.map((f) => f.name);
    expect(names).not.toContain("enableSharing");
    expect(names).not.toContain("shareWith");
    expect(names).not.toContain("permission");
    expect(names).not.toContain("sendNotification");
  });

  it("risk: medium, not destructive, no confirmation", () => {
    expect(googleDocsCreateDocumentMeta.riskLevel).toBe("medium");
    expect(googleDocsCreateDocumentMeta.isDestructive).toBe(false);
    expect(googleDocsCreateDocumentMeta.requiresConfirmation).toBe(false);
    expect(googleDocsCreateDocumentMeta.riskDescription).toBeDefined();
  });
});

describe("Google Docs create_document meta — output shape", () => {
  it("output names match the runtime handler (documentId / documentUrl / title / createdAt / folderId)", () => {
    expect(googleDocsCreateDocumentMeta.outputs.map((o) => o.name)).toEqual([
      "documentId",
      "documentUrl",
      "title",
      "createdAt",
      "folderId",
    ]);
  });

  it("documentUrl + title carry sensitive=true", () => {
    const out = new Map(
      googleDocsCreateDocumentMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("documentUrl")?.sensitive).toBe(true);
    expect(out.get("title")?.sensitive).toBe(true);
  });

  it("opaque ids / timestamps are NOT sensitive", () => {
    const out = new Map(
      googleDocsCreateDocumentMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("documentId")?.sensitive).toBeUndefined();
    expect(out.get("createdAt")?.sensitive).toBeUndefined();
    expect(out.get("folderId")?.sensitive).toBeUndefined();
  });

  it("does not produce FileRef (export_document is the only FileRef-producing Google Docs action)", () => {
    expect(googleDocsCreateDocumentMeta.producesFileRef).toBe(false);
    expect(googleDocsCreateDocumentMeta.consumesFileRef).toBe(false);
  });
});
