/**
 * Slice 3.ONENOTE-4 integration test — OneNote `copy_page` config
 * shape as it flows into the WorkflowBuilder shell.
 *
 * Pins the source-side cascade (notebookId → sectionId → sourcePageId
 * combobox triple), the **dual-hierarchy picker limitation**
 * (targetSectionId is `text` not combobox), and the **async Graph
 * operation** semantics that `success: true` means "request accepted"
 * — NOT "copy complete". The runtime returns `operationLocation` for
 * downstream polling (deferred to ONENOTE-N polish).
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

import { microsoftOneNoteCopyPageMeta } from "@/integrations/microsoft-onenote/actions/copyPage.meta";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeTriggers.mockReset();
  mockListProviderActions.mockReset();
  mockListProviderTriggers.mockReset();
  mockFetchOptionsSource.mockReset();
});

describe("OneNote copy_page meta — Builder shape (source cascade + dual-hierarchy limitation)", () => {
  it("preserves camelCase field names verbatim (notebookId / sectionId / sourcePageId / targetSectionId)", () => {
    expect(microsoftOneNoteCopyPageMeta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "sourcePageId",
      "targetSectionId",
    ]);
  });

  it("source-side cascade: notebookId → sectionId → sourcePageId (every level required)", () => {
    const nb = microsoftOneNoteCopyPageMeta.fields.find(
      (f) => f.name === "notebookId",
    )!;
    const sec = microsoftOneNoteCopyPageMeta.fields.find(
      (f) => f.name === "sectionId",
    )!;
    const src = microsoftOneNoteCopyPageMeta.fields.find(
      (f) => f.name === "sourcePageId",
    )!;
    expect(nb.optionsSource).toBe("microsoft-onenote:notebooks");
    expect(nb.dependsOn).toBeUndefined();
    expect(sec.optionsSource).toBe("microsoft-onenote:sections");
    expect(sec.dependsOn).toBe("notebookId");
    expect(src.optionsSource).toBe("microsoft-onenote:pages");
    expect(src.dependsOn).toBe("sectionId");
    expect([nb.required, sec.required, src.required]).toEqual([true, true, true]);
  });

  it("targetSectionId is TEXT input (NOT combobox) — dual-hierarchy picker limitation", () => {
    const tgt = microsoftOneNoteCopyPageMeta.fields.find(
      (f) => f.name === "targetSectionId",
    )!;
    expect(tgt.type).toBe("text");
    expect(tgt.optionsSource).toBeUndefined();
    expect(tgt.dependsOn).toBeUndefined();
    expect(tgt.required).toBe(true);
  });

  it("description conveys the copy completes AFTER the step succeeds (async, outcome language)", () => {
    expect(microsoftOneNoteCopyPageMeta.description).toMatch(
      /finishes on Microsoft's side|shortly after/i,
    );
    expect(microsoftOneNoteCopyPageMeta.description).toMatch(
      /New Note trigger/i,
    );
  });

  it("description contains no Graph endpoint paths or internal slice IDs (config-UX copy sweep)", () => {
    expect(microsoftOneNoteCopyPageMeta.description).not.toMatch(
      /copyToSection|POST \/|\/me\/onenote|ONENOTE-\d|ONENOTE-N/i,
    );
  });

  it("targetSectionId description points authors at upstream list_sections + variable picker", () => {
    const tgt = microsoftOneNoteCopyPageMeta.fields.find(
      (f) => f.name === "targetSectionId",
    )!;
    expect(tgt.description?.toLowerCase()).toMatch(/list_sections|variable/);
  });

  it("risk: medium, not destructive (copy is recoverable by deleting the duplicate once it surfaces)", () => {
    expect(microsoftOneNoteCopyPageMeta.riskLevel).toBe("medium");
    expect(microsoftOneNoteCopyPageMeta.isDestructive).toBe(false);
    expect(microsoftOneNoteCopyPageMeta.requiresConfirmation).toBe(false);
  });

  it("riskDescription clarifies async semantics", () => {
    expect(microsoftOneNoteCopyPageMeta.riskDescription).toBeDefined();
    expect(
      microsoftOneNoteCopyPageMeta.riskDescription!.toLowerCase(),
    ).toMatch(/asynchronous|accepted.*not.*complete|async/);
  });
});

describe("OneNote copy_page meta — output shape (operationLocation)", () => {
  it("output exposes operationLocation + sourcePageId + targetSectionId + success", () => {
    const names = microsoftOneNoteCopyPageMeta.outputs
      .map((o) => o.name)
      .sort();
    expect(names).toEqual([
      "operationLocation",
      "sourcePageId",
      "success",
      "targetSectionId",
    ]);
  });

  it("success output description warns that `true` means accepted, NOT complete", () => {
    const success = microsoftOneNoteCopyPageMeta.outputs.find(
      (o) => o.name === "success",
    )!;
    expect(success.type).toBe("boolean");
    expect(success.description?.toLowerCase()).toMatch(
      /accepted|not.*complete/,
    );
  });

  it("operationLocation output documents polling chain via new_note trigger (ONENOTE-5)", () => {
    const op = microsoftOneNoteCopyPageMeta.outputs.find(
      (o) => o.name === "operationLocation",
    )!;
    expect(op.type).toBe("string");
    expect(op.description?.toLowerCase()).toMatch(/poll|new_note/);
  });
});
