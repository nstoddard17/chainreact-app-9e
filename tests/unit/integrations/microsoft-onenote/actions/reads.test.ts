/**
 * @jest-environment node
 *
 * Combined coverage for the 4 pure-read OneNote action handlers:
 * `list_notebooks`, `list_sections`, `get_notebook_details`,
 * `get_section_details`. Each is a thin wrapper around its
 * corresponding API helper; the per-handler files for create_page /
 * update_page / copy_page / list_pages / get_page_content /
 * delete_page already cover the deeper invariants.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockNotebooksList = jest.fn();
const mockNotebooksGet = jest.fn();
const mockSectionsList = jest.fn();
const mockSectionsGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-onenote/api/notebooksList", () => ({
  notebooksList: (...args: unknown[]) => mockNotebooksList(...args),
}));
jest.mock("@/integrations/microsoft-onenote/api/notebooksGet", () => ({
  notebooksGet: (...args: unknown[]) => mockNotebooksGet(...args),
}));
jest.mock("@/integrations/microsoft-onenote/api/sectionsList", () => ({
  sectionsList: (...args: unknown[]) => mockSectionsList(...args),
}));
jest.mock("@/integrations/microsoft-onenote/api/sectionsGet", () => ({
  sectionsGet: (...args: unknown[]) => mockSectionsGet(...args),
}));

import { listNotebooks } from "@/integrations/microsoft-onenote/actions/listNotebooks";
import { ListNotebooksConfigSchema } from "@/integrations/microsoft-onenote/actions/listNotebooks.schema";
import { listSections } from "@/integrations/microsoft-onenote/actions/listSections";
import { ListSectionsConfigSchema } from "@/integrations/microsoft-onenote/actions/listSections.schema";
import { getNotebookDetails } from "@/integrations/microsoft-onenote/actions/getNotebookDetails";
import { GetNotebookDetailsConfigSchema } from "@/integrations/microsoft-onenote/actions/getNotebookDetails.schema";
import { getSectionDetails } from "@/integrations/microsoft-onenote/actions/getSectionDetails";
import { GetSectionDetailsConfigSchema } from "@/integrations/microsoft-onenote/actions/getSectionDetails.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockNotebooksList.mockReset();
  mockNotebooksGet.mockReset();
  mockSectionsList.mockReset();
  mockSectionsGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trig: TriggerEvent = {
  provider: "microsoft-onenote",
  eventType: "manual",
  eventId: "e",
  occurredAt: "t",
  accountId: "alice@contoso.com",
  payload: {},
};

describe("list_notebooks", () => {
  it("schema defaults orderBy to 'displayName asc' (V1-preserved)", () => {
    expect(
      ListNotebooksConfigSchema.parse({}).orderBy,
    ).toBe("displayName asc");
  });

  it("returns normalized notebooks[] + count + hasMore + nextLink", async () => {
    mockNotebooksList.mockResolvedValueOnce({
      notebooks: [
        {
          id: "nb-1",
          displayName: "Work",
          createdDateTime: "2026-05-01T00:00:00Z",
          lastModifiedDateTime: "2026-05-08T00:00:00Z",
          isDefault: true,
          isShared: false,
        },
      ],
      nextLink: null,
    });
    const result = await listNotebooks({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trig,
    });
    const notebooks = result.output.notebooks as Array<Record<string, unknown>>;
    expect(notebooks).toHaveLength(1);
    expect(notebooks[0]).toEqual({
      id: "nb-1",
      displayName: "Work",
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-08T00:00:00Z",
      isDefault: true,
      isShared: false,
    });
    expect(result.output.count).toBe(1);
    expect(result.output.hasMore).toBe(false);
  });
});

describe("list_sections", () => {
  it("schema requires notebookId", () => {
    expect(() => ListSectionsConfigSchema.parse({})).toThrow();
  });

  it("forwards notebookId + orderBy to the wrapper", async () => {
    mockSectionsList.mockResolvedValueOnce({
      sections: [],
      nextLink: null,
    });
    await listSections({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        notebookId: "nb-1",
        orderBy: "lastModifiedDateTime desc",
      },
      triggerEvent: trig,
    });
    expect(mockSectionsList.mock.calls[0]![0]).toMatchObject({
      notebookId: "nb-1",
      orderBy: "lastModifiedDateTime desc",
    });
  });

  it("normalizes section output", async () => {
    mockSectionsList.mockResolvedValueOnce({
      sections: [
        {
          id: "sec-1",
          displayName: "Q4",
          createdDateTime: "2026-05-01T00:00:00Z",
          lastModifiedDateTime: "2026-05-08T00:00:00Z",
          isDefault: false,
        },
      ],
      nextLink: "https://x/p2",
    });
    const result = await listSections({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { notebookId: "nb-1" },
      triggerEvent: trig,
    });
    const sections = result.output.sections as Array<Record<string, unknown>>;
    expect(sections[0]).toEqual({
      id: "sec-1",
      displayName: "Q4",
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-08T00:00:00Z",
      isDefault: false,
    });
    expect(result.output.hasMore).toBe(true);
  });
});

describe("get_notebook_details", () => {
  it("schema requires notebookId", () => {
    expect(() => GetNotebookDetailsConfigSchema.parse({})).toThrow();
  });

  it("returns id + displayName + dates + flags + URLs + links", async () => {
    mockNotebooksGet.mockResolvedValueOnce({
      id: "nb-1",
      displayName: "Work",
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-08T00:00:00Z",
      isDefault: true,
      isShared: false,
      sectionsUrl: "https://x/nb-1/sections",
      sectionGroupsUrl: "https://x/nb-1/sectionGroups",
      links: { oneNoteWebUrl: { href: "https://x/nb-1/edit" } },
    });
    const result = await getNotebookDetails({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { notebookId: "nb-1" },
      triggerEvent: trig,
    });
    expect(result.output.id).toBe("nb-1");
    expect(result.output.displayName).toBe("Work");
    expect(result.output.sectionsUrl).toBe("https://x/nb-1/sections");
    expect(result.output.links).toEqual({
      oneNoteWebUrl: { href: "https://x/nb-1/edit" },
    });
  });
});

describe("get_section_details", () => {
  it("schema requires sectionId", () => {
    expect(() => GetSectionDetailsConfigSchema.parse({})).toThrow();
  });

  it("returns id + displayName + dates + flags + pagesUrl + links", async () => {
    mockSectionsGet.mockResolvedValueOnce({
      id: "sec-1",
      displayName: "Q4",
      createdDateTime: "2026-05-01T00:00:00Z",
      lastModifiedDateTime: "2026-05-08T00:00:00Z",
      isDefault: false,
      pagesUrl: "https://x/sec-1/pages",
      links: { oneNoteWebUrl: { href: "https://x/sec-1/edit" } },
    });
    const result = await getSectionDetails({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { sectionId: "sec-1" },
      triggerEvent: trig,
    });
    expect(result.output.id).toBe("sec-1");
    expect(result.output.pagesUrl).toBe("https://x/sec-1/pages");
    expect(result.output.links).toEqual({
      oneNoteWebUrl: { href: "https://x/sec-1/edit" },
    });
  });
});
