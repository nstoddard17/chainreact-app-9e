/**
 * Slice 3.GDOCS-4 integration test — Google Docs `share_document`
 * config shape (destructive trio + Q11) as it flows into the
 * WorkflowBuilder shell.
 *
 * Pins:
 *   - Full destructive-trio classification.
 *   - Q11 honest-state: `sendNotification` required, NO default.
 *   - 8 fields, camelCase preservation per GDOCS-1 §8.1.
 *   - Drive canonical permission enum (`reader / commenter / writer /
 *     owner`) on both `permission` and `publicPermission`.
 *   - `shareWith` string-array with Google Contacts autocomplete
 *     deferred (no optionsSource).
 *
 * The cross-provider destructive-action confirmation modal itself is
 * exercised by `destructive-action-confirmation-modal.test.tsx`.
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

import { googleDocsShareDocumentMeta } from "@/integrations/google-docs/actions/shareDocument.meta";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeTriggers.mockReset();
  mockListProviderActions.mockReset();
  mockListProviderTriggers.mockReset();
  mockFetchOptionsSource.mockReset();
});

describe("Google Docs share_document meta — destructive trio + Q11", () => {
  it("declares the full destructive trio (isDestructive + requiresConfirmation + riskLevel:high)", () => {
    expect(googleDocsShareDocumentMeta.isDestructive).toBe(true);
    expect(googleDocsShareDocumentMeta.requiresConfirmation).toBe(true);
    expect(googleDocsShareDocumentMeta.riskLevel).toBe("high");
  });

  it("riskDescription mentions public sharing + ownership transfer + sendNotification", () => {
    const desc = googleDocsShareDocumentMeta.riskDescription ?? "";
    expect(desc).toMatch(/public sharing/i);
    expect(desc).toMatch(/ownership/i);
    expect(desc).toMatch(/sendnotification/i);
  });

  it("preserves V1 camelCase field names verbatim (8 fields)", () => {
    expect(googleDocsShareDocumentMeta.fields.map((f) => f.name)).toEqual([
      "documentId",
      "shareWith",
      "permission",
      "sendNotification",
      "message",
      "makePublic",
      "publicPermission",
      "allowDiscovery",
      "transferOwnership",
    ]);
  });

  it("Q11 — sendNotification is boolean + required + NO defaultValue (no silent default)", () => {
    const field = googleDocsShareDocumentMeta.fields.find(
      (f) => f.name === "sendNotification",
    )!;
    expect(field.type).toBe("boolean");
    expect(field.required).toBe(true);
    expect(field.defaultValue).toBeUndefined();
  });

  it("documentId picker wires google-docs:documents", () => {
    const field = googleDocsShareDocumentMeta.fields.find(
      (f) => f.name === "documentId",
    )!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("google-docs:documents");
    expect(field.required).toBe(true);
  });

  it("shareWith is string-array — no autocomplete optionsSource (google-contacts deferred)", () => {
    const field = googleDocsShareDocumentMeta.fields.find(
      (f) => f.name === "shareWith",
    )!;
    expect(field.type).toBe("string-array");
    expect(field.optionsSource).toBeUndefined();
    expect(field.required).toBe(false);
  });

  it("permission enum uses Drive canonical names (reader / commenter / writer / owner)", () => {
    const field = googleDocsShareDocumentMeta.fields.find(
      (f) => f.name === "permission",
    )!;
    expect(field.type).toBe("select");
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "commenter",
      "owner",
      "reader",
      "writer",
    ]);
    expect(field.defaultValue).toBe("reader");
  });

  it("publicPermission enum mirrors permission (same Drive canonical set)", () => {
    const field = googleDocsShareDocumentMeta.fields.find(
      (f) => f.name === "publicPermission",
    )!;
    expect(field.type).toBe("select");
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "commenter",
      "owner",
      "reader",
      "writer",
    ]);
    expect(field.defaultValue).toBe("reader");
  });

  it("makePublic / allowDiscovery / transferOwnership are boolean + optional + default false", () => {
    const byName = new Map(
      googleDocsShareDocumentMeta.fields.map((f) => [f.name, f]),
    );
    for (const name of ["makePublic", "allowDiscovery", "transferOwnership"]) {
      const field = byName.get(name)!;
      expect(field.type).toBe("boolean");
      expect(field.required).toBe(false);
      expect(field.defaultValue).toBe(false);
    }
  });

  it("message is textarea + optional", () => {
    const field = googleDocsShareDocumentMeta.fields.find(
      (f) => f.name === "message",
    )!;
    expect(field.type).toBe("textarea");
    expect(field.required).toBe(false);
  });
});

describe("Google Docs share_document meta — output sensitivity", () => {
  it("output names match the runtime handler", () => {
    expect(googleDocsShareDocumentMeta.outputs.map((o) => o.name)).toEqual([
      "documentId",
      "documentUrl",
      "sharedWith",
      "isPublic",
      "permissionIds",
      "errors",
    ]);
  });

  it("sharedWith + documentUrl carry sensitive=true", () => {
    const out = new Map(
      googleDocsShareDocumentMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("sharedWith")?.sensitive).toBe(true);
    expect(out.get("documentUrl")?.sensitive).toBe(true);
  });

  it("isPublic / permissionIds / errors / documentId NOT sensitive", () => {
    const out = new Map(
      googleDocsShareDocumentMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("isPublic")?.sensitive).toBeUndefined();
    expect(out.get("permissionIds")?.sensitive).toBeUndefined();
    expect(out.get("errors")?.sensitive).toBeUndefined();
    expect(out.get("documentId")?.sensitive).toBeUndefined();
  });

  it("no secret-shaped output names", () => {
    const names = googleDocsShareDocumentMeta.outputs.map((o) =>
      o.name.toLowerCase(),
    );
    for (const n of names) {
      expect(n).not.toContain("token");
      expect(n).not.toContain("secret");
      expect(n).not.toContain("apikey");
    }
  });
});
