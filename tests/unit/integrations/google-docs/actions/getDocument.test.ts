/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — google-docs:get_document action handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDocumentsGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/google/api/docs/documentsGet", () => ({
  documentsGet: (...args: unknown[]) => mockDocumentsGet(...args),
}));

import { getDocument } from "@/integrations/google-docs/actions/getDocument";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDocumentsGet.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
    apiCall("ya29.access"),
  );
});

function docsTrigger(): TriggerEvent {
  return {
    provider: "google-docs",
    eventType: "new_document",
    eventId: "evt-1",
    occurredAt: "2026-05-23T12:00:00Z",
    providerAccountId: "alice@example.com",
    payload: {},
  };
}

describe("get_document — flattens body to plain text", () => {
  it("walks paragraph.elements[].textRun.content and joins", async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      documentId: "doc-1",
      title: "My Doc",
      revisionId: "rev-A",
      body: {
        content: [
          {
            paragraph: {
              elements: [
                { textRun: { content: "Hello " } },
                { textRun: { content: "world\n" } },
              ],
            },
          },
          {
            paragraph: {
              elements: [{ textRun: { content: "Line two" } }],
            },
          },
        ],
      },
    });
    const result = await getDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { documentId: "doc-1" },
      triggerEvent: docsTrigger(),
    });
    expect(result.output.content).toBe("Hello world\nLine two");
    expect(result.output.title).toBe("My Doc");
    expect(result.output.revisionId).toBe("rev-A");
    expect(result.output.documentUrl).toBe(
      "https://docs.google.com/document/d/doc-1/edit",
    );
  });

  it("returns empty string for an empty document body", async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      documentId: "doc-1",
      title: null,
      body: { content: [] },
    });
    const result = await getDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { documentId: "doc-1" },
      triggerEvent: docsTrigger(),
    });
    expect(result.output.content).toBe("");
    expect(result.output.title).toBeNull();
  });

  it("skips non-paragraph structural elements (tables, sectionBreaks) without crashing", async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      documentId: "doc-1",
      body: {
        content: [
          { sectionBreak: { sectionStyle: {} } },
          {
            paragraph: { elements: [{ textRun: { content: "Visible text" } }] },
          },
          { table: { rows: 1, columns: 1 } },
        ],
      },
    });
    const result = await getDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { documentId: "doc-1" },
      triggerEvent: docsTrigger(),
    });
    expect(result.output.content).toBe("Visible text");
  });

  it("skips elements that don't carry textRun.content (inline objects, etc.)", async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      documentId: "doc-1",
      body: {
        content: [
          {
            paragraph: {
              elements: [
                { textRun: { content: "Real " } },
                { inlineObjectElement: { inlineObjectId: "i-1" } },
                { textRun: { content: "text" } },
              ],
            },
          },
        ],
      },
    });
    const result = await getDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { documentId: "doc-1" },
      triggerEvent: docsTrigger(),
    });
    expect(result.output.content).toBe("Real text");
  });
});

describe("get_document — schema + integration plumbing", () => {
  it("rejects missing documentId", async () => {
    await expect(
      getDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(/documentId is required/);
  });

  it("threads accountId from google-docs trigger event", async () => {
    mockDocumentsGet.mockResolvedValueOnce({ documentId: "doc-1", body: { content: [] } });
    await getDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { documentId: "doc-1" },
      triggerEvent: docsTrigger(),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google-docs",
        accountId: "alice@example.com",
      }),
    );
  });
});
