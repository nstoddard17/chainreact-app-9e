/**
 * Slice 3.ONENOTE-4 integration test — OneNote `create_page` config
 * shape as it flows into the WorkflowBuilder shell.
 *
 * Pins the runtime-schema parity, the 3-level cascade chain
 * (notebookId → sectionId), and the V2-v1 `text/html` default flip
 * (D-ON1, ONENOTE-1). Field-name preservation enforced — any rename
 * in the runtime schema OR meta drifts both ways trip these
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

import { microsoftOneNoteCreatePageMeta } from "@/integrations/microsoft-onenote/actions/createPage.meta";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeTriggers.mockReset();
  mockListProviderActions.mockReset();
  mockListProviderTriggers.mockReset();
  mockFetchOptionsSource.mockReset();
});

describe("OneNote create_page meta — Builder shape", () => {
  it("preserves runtime camelCase field names verbatim (notebookId / sectionId / title / content / contentType)", () => {
    expect(microsoftOneNoteCreatePageMeta.fields.map((f) => f.name)).toEqual([
      "notebookId",
      "sectionId",
      "title",
      "content",
      "contentType",
    ]);
  });

  it("notebook picker wires microsoft-onenote:notebooks with NO deps (top-level)", () => {
    const field = microsoftOneNoteCreatePageMeta.fields.find(
      (f) => f.name === "notebookId",
    )!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("microsoft-onenote:notebooks");
    expect(field.dependsOn).toBeUndefined();
    expect(field.required).toBe(true);
  });

  it("section picker wires microsoft-onenote:sections dependsOn notebookId (cascade chain)", () => {
    const field = microsoftOneNoteCreatePageMeta.fields.find(
      (f) => f.name === "sectionId",
    )!;
    expect(field.type).toBe("combobox");
    expect(field.optionsSource).toBe("microsoft-onenote:sections");
    expect(field.dependsOn).toBe("notebookId");
    expect(field.required).toBe(true);
  });

  it("D-ON1 — contentType defaults to text/html (V2-v1 flip from V1's text/plain)", () => {
    const field = microsoftOneNoteCreatePageMeta.fields.find(
      (f) => f.name === "contentType",
    )!;
    expect(field.type).toBe("select");
    expect(field.required).toBe(true);
    expect(field.defaultValue).toBe("text/html");
    expect(field.options?.map((o) => o.value).sort()).toEqual([
      "application/xhtml+xml",
      "text/html",
      "text/plain",
    ]);
  });

  it("title is text + required", () => {
    const field = microsoftOneNoteCreatePageMeta.fields.find(
      (f) => f.name === "title",
    )!;
    expect(field.type).toBe("text");
    expect(field.required).toBe(true);
  });

  it("content is textarea + optional (schema defaults to '' so empty body is valid)", () => {
    const field = microsoftOneNoteCreatePageMeta.fields.find(
      (f) => f.name === "content",
    )!;
    expect(field.type).toBe("textarea");
    expect(field.required).toBe(false);
  });

  it("risk: medium, not destructive, no confirmation (recoverable via delete_page)", () => {
    expect(microsoftOneNoteCreatePageMeta.riskLevel).toBe("medium");
    expect(microsoftOneNoteCreatePageMeta.isDestructive).toBe(false);
    expect(microsoftOneNoteCreatePageMeta.requiresConfirmation).toBe(false);
    expect(microsoftOneNoteCreatePageMeta.riskDescription).toBeDefined();
  });

  it("description explains text/html default + Graph HTML5 grammar", () => {
    expect(microsoftOneNoteCreatePageMeta.description).toMatch(/text\/html/);
    expect(microsoftOneNoteCreatePageMeta.description).toMatch(/html5|html/i);
  });
});

describe("OneNote create_page meta — output shape", () => {
  it("output names match runtime handler (id / title / contentUrl / webUrl / createdDateTime / lastModifiedDateTime / level / order)", () => {
    expect(microsoftOneNoteCreatePageMeta.outputs.map((o) => o.name)).toEqual([
      "id",
      "title",
      "contentUrl",
      "webUrl",
      "createdDateTime",
      "lastModifiedDateTime",
      "level",
      "order",
    ]);
  });

  it("title + webUrl + contentUrl sensitive; id + timestamps + level/order NOT sensitive", () => {
    const out = new Map(
      microsoftOneNoteCreatePageMeta.outputs.map((o) => [o.name, o]),
    );
    expect(out.get("title")?.sensitive).toBe(true);
    expect(out.get("webUrl")?.sensitive).toBe(true);
    expect(out.get("contentUrl")?.sensitive).toBe(true);
    expect(out.get("id")?.sensitive).toBeUndefined();
    expect(out.get("createdDateTime")?.sensitive).toBeUndefined();
    expect(out.get("level")?.sensitive).toBeUndefined();
    expect(out.get("order")?.sensitive).toBeUndefined();
  });
});
