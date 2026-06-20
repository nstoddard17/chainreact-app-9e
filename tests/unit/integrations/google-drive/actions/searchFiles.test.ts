/**
 * @jest-environment node
 *
 * google-drive:search_files — read-only, one-page name search.
 *
 * Business rules under test:
 *   - forwards the query as `nameContains`, plus folder/pageSize/pageToken,
 *     and a bounded fields mask, to the shared filesList wrapper;
 *   - pageSize defaults to 25 and is capped at 100 (focused lookup);
 *   - each result is a bounded projection — raw Drive file resources are
 *     never spread, so owner emails / capabilities cannot leak;
 *   - one page only (nextPageToken is surfaced, never auto-followed);
 *   - strict schema rejects a missing/empty query before any API call;
 *   - provider 401 propagates.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockFilesList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/filesList", () => ({
  filesList: (...args: unknown[]) => mockFilesList(...args),
}));

import { searchFiles } from "@/integrations/google-drive/actions/searchFiles";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesList.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-drive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.test",
    payload: {},
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

describe("searchFiles action", () => {
  it("forwards query as nameContains + folder/pageSize/pageToken + bounded mask", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockFilesList.mockResolvedValue({ files: [] });

    await searchFiles(
      baseInput({ query: "report", folderId: "fld-A", pageSize: 10, pageToken: "pg-1" }),
    );

    const passed = mockFilesList.mock.calls[0]![0] as Record<string, unknown>;
    expect(passed).toEqual(
      expect.objectContaining({
        accessToken: "tok",
        nameContains: "report",
        folderId: "fld-A",
        pageSize: 10,
        pageToken: "pg-1",
        includeTrashed: false,
      }),
    );
    expect(String(passed.fields)).not.toMatch(/owners|permissions|capabilities/);
  });

  it("defaults pageSize to 25 when omitted", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockFilesList.mockResolvedValue({ files: [] });

    await searchFiles(baseInput({ query: "q" }));

    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 25 }),
    );
  });

  it("rejects pageSize > 100 (search cap) and < 1", async () => {
    await expect(searchFiles(baseInput({ query: "q", pageSize: 101 }))).rejects.toThrow();
    await expect(searchFiles(baseInput({ query: "q", pageSize: 0 }))).rejects.toThrow();
    expect(mockFilesList).not.toHaveBeenCalled();
  });

  it("projects each file to bounded metadata and never spreads raw provider fields", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockFilesList.mockResolvedValue({
      files: [
        {
          id: "f-1",
          name: "report.pdf",
          mimeType: "application/pdf",
          modifiedTime: "2026-05-08T00:00:00Z",
          size: "2048",
          webViewLink: "https://drive.google.com/file/d/f-1/view",
          // Hostile extras — must NOT reach output.
          owners: [{ emailAddress: "alice@example.test" }],
          capabilities: { canDownload: true },
        },
      ],
      nextPageToken: "pg-2",
      incompleteSearch: false,
    });

    const result = await searchFiles(baseInput({ query: "report" }));

    expect(result.output.files).toEqual([
      {
        id: "f-1",
        name: "report.pdf",
        mimeType: "application/pdf",
        modifiedTime: "2026-05-08T00:00:00Z",
        size: "2048",
        webViewLink: "https://drive.google.com/file/d/f-1/view",
      },
    ]);
    expect(JSON.stringify(result.output)).not.toContain("alice@example.test");
    expect(JSON.stringify(result.output)).not.toContain("capabilities");
    expect(result.output.count).toBe(1);
    expect(result.output.nextPageToken).toBe("pg-2");
  });

  it("surfaces one page only — nextPageToken returned, not auto-followed", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("tok"));
    mockFilesList.mockResolvedValue({ files: [{ id: "f-1" }], nextPageToken: "pg-2" });

    const result = await searchFiles(baseInput({ query: "q" }));

    expect(mockFilesList).toHaveBeenCalledTimes(1);
    expect(result.output.nextPageToken).toBe("pg-2");
  });

  it("rejects a missing/empty query before calling the provider", async () => {
    await expect(searchFiles(baseInput({}))).rejects.toThrow();
    await expect(searchFiles(baseInput({ query: "" }))).rejects.toThrow();
    expect(mockFilesList).not.toHaveBeenCalled();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("Google Drive files.list returned HTTP 401"));
    await expect(searchFiles(baseInput({ query: "q" }))).rejects.toThrow(/401/);
  });
});
