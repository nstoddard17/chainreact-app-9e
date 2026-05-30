/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — google-docs:update_document action handler.
 *
 * Covers all 5 insertLocation modes + wildcard search.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDocumentsGet = jest.fn();
const mockDocumentsBatchUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/google/api/docs/documentsGet", () => ({
  documentsGet: (...args: unknown[]) => mockDocumentsGet(...args),
}));

jest.mock("@/integrations/_shared/google/api/docs/documentsBatchUpdate", () => ({
  documentsBatchUpdate: (...args: unknown[]) => mockDocumentsBatchUpdate(...args),
}));

import { updateDocument } from "@/integrations/google-docs/actions/updateDocument";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDocumentsGet.mockReset();
  mockDocumentsBatchUpdate.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
    apiCall("ya29.access"),
  );
});

function docsTrigger(): TriggerEvent {
  return {
    provider: "google-docs",
    eventType: "document_updated",
    eventId: "evt-1",
    occurredAt: "2026-05-23T12:00:00Z",
    providerAccountId: "alice@example.com",
    payload: {},
  };
}

/**
 * Build a Docs Document resource whose body flattens to the given
 * text starting at index 1. Each character lives at one Docs index
 * (no formatting) — sufficient for the after_text / before_text
 * tests' index mapping.
 */
function docWithBody(text: string, title = "Test"): Record<string, unknown> {
  return {
    documentId: "doc-1",
    title,
    body: {
      content: [
        {
          startIndex: 0,
          endIndex: 1,
          sectionBreak: {},
        },
        {
          startIndex: 1,
          endIndex: 1 + text.length,
          paragraph: {
            elements: [
              {
                startIndex: 1,
                endIndex: 1 + text.length,
                textRun: { content: text },
              },
            ],
          },
        },
      ],
    },
  };
}

describe("update_document — beginning mode", () => {
  it("inserts at index 1 with trailing newline (no documents.get round-trip)", async () => {
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "beginning",
        content: "Header line",
      },
      triggerEvent: docsTrigger(),
    });
    expect(mockDocumentsGet).not.toHaveBeenCalled();
    const requests = (mockDocumentsBatchUpdate.mock.calls[0]![0]! as {
      requests: ReadonlyArray<Record<string, unknown>>;
    }).requests;
    expect(requests).toEqual([
      { insertText: { location: { index: 1 }, text: "Header line\n" } },
    ]);
  });
});

describe("update_document — end mode", () => {
  it("fetches the document, inserts at endIndex-1 with leading newline", async () => {
    // Body of "abcdefghij" → 10 chars at index 1..11 → endIndex 11 →
    // insertion at index 10 (endIndex - 1 per Docs sentinel semantic).
    mockDocumentsGet.mockResolvedValueOnce(docWithBody("abcdefghij"));
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "end",
        content: "tail",
      },
      triggerEvent: docsTrigger(),
    });
    expect(mockDocumentsGet).toHaveBeenCalledTimes(1);
    const requests = (mockDocumentsBatchUpdate.mock.calls[0]![0]! as {
      requests: ReadonlyArray<Record<string, unknown>>;
    }).requests;
    expect(requests).toEqual([
      { insertText: { location: { index: 10 }, text: "\ntail" } },
    ]);
  });

  it("handles an empty document gracefully (endIndex falls back to 1)", async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      documentId: "doc-1",
      body: { content: [] },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "end",
        content: "first content",
      },
      triggerEvent: docsTrigger(),
    });
    const requests = (mockDocumentsBatchUpdate.mock.calls[0]![0]! as {
      requests: ReadonlyArray<Record<string, unknown>>;
    }).requests;
    expect(requests[0]).toMatchObject({
      insertText: { location: { index: 1 } },
    });
  });
});

describe("update_document — replace mode", () => {
  it("emits delete+insert as a single batchUpdate when body is non-empty", async () => {
    mockDocumentsGet.mockResolvedValueOnce(docWithBody("old body"));
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "replace",
        content: "new body",
      },
      triggerEvent: docsTrigger(),
    });
    const requests = (mockDocumentsBatchUpdate.mock.calls[0]![0]! as {
      requests: ReadonlyArray<Record<string, unknown>>;
    }).requests;
    expect(requests.length).toBe(2);
    expect(requests[0]).toMatchObject({
      deleteContentRange: {
        range: { startIndex: 1, endIndex: expect.any(Number) },
      },
    });
    expect(requests[1]).toMatchObject({
      insertText: { location: { index: 1 }, text: "new body" },
    });
  });

  it("skips delete when document is already empty (insert-only)", async () => {
    mockDocumentsGet.mockResolvedValueOnce({
      documentId: "doc-1",
      body: { content: [] },
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "replace",
        content: "first content",
      },
      triggerEvent: docsTrigger(),
    });
    const requests = (mockDocumentsBatchUpdate.mock.calls[0]![0]! as {
      requests: ReadonlyArray<Record<string, unknown>>;
    }).requests;
    expect(requests.length).toBe(1);
    expect(requests[0]).toMatchObject({
      insertText: { location: { index: 1 } },
    });
  });
});

describe("update_document — after_text mode", () => {
  it("inserts at the index AFTER the last match", async () => {
    // "Hello world Hello world" → chars at indices 1..23
    // Last "Hello" starts at offset 12 → Docs index 13.
    // Match ends at offset 17 → Docs index 18.
    mockDocumentsGet.mockResolvedValueOnce(
      docWithBody("Hello world Hello world"),
    );
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "after_text",
        searchText: "Hello",
        content: "INSERTED",
      },
      triggerEvent: docsTrigger(),
    });
    const requests = (mockDocumentsBatchUpdate.mock.calls[0]![0]! as {
      requests: ReadonlyArray<Record<string, unknown>>;
    }).requests;
    expect(requests[0]).toMatchObject({
      insertText: { location: { index: 18 }, text: "INSERTED" },
    });
  });

  it("supports wildcard `*` (regex `.*`) — V1 semantic preserved", async () => {
    // "alphaXYZbeta" — pattern "alpha*beta" matches the whole span.
    mockDocumentsGet.mockResolvedValueOnce(docWithBody("alphaXYZbeta"));
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "after_text",
        searchText: "alpha*beta",
        content: "X",
      },
      triggerEvent: docsTrigger(),
    });
    expect(mockDocumentsBatchUpdate).toHaveBeenCalledTimes(1);
  });

  it("throws when searchText is not found in document", async () => {
    mockDocumentsGet.mockResolvedValueOnce(docWithBody("nothing matching here"));
    await expect(
      updateDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          insertLocation: "after_text",
          searchText: "missing-needle",
          content: "X",
        },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(/missing-needle.*not found/);
    expect(mockDocumentsBatchUpdate).not.toHaveBeenCalled();
  });

  it("escapes regex metacharacters in searchText (so `.` matches literal `.`)", async () => {
    // searchText "a.b" should NOT match "axb" if regex metachars
    // are properly escaped. "a.b" literally is present in the doc.
    mockDocumentsGet.mockResolvedValueOnce(docWithBody("axb a.b after"));
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "after_text",
        searchText: "a.b",
        content: "X",
      },
      triggerEvent: docsTrigger(),
    });
    const requests = (mockDocumentsBatchUpdate.mock.calls[0]![0]! as {
      requests: ReadonlyArray<Record<string, unknown>>;
    }).requests;
    // Document is "axb a.b after" at Docs index 1..14.
    // Literal "a.b" is at flat offset 4..7 → Docs index 5..8.
    // After-text insertion: Docs index 8.
    expect(requests[0]).toMatchObject({
      insertText: { location: { index: 8 } },
    });
  });
});

describe("update_document — before_text mode", () => {
  it("inserts at the index BEFORE the last match", async () => {
    // Same fixture as after_text: "Hello world Hello world".
    // Last "Hello" starts at offset 12 → Docs index 13.
    mockDocumentsGet.mockResolvedValueOnce(
      docWithBody("Hello world Hello world"),
    );
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "before_text",
        searchText: "Hello",
        content: "PRE",
      },
      triggerEvent: docsTrigger(),
    });
    const requests = (mockDocumentsBatchUpdate.mock.calls[0]![0]! as {
      requests: ReadonlyArray<Record<string, unknown>>;
    }).requests;
    expect(requests[0]).toMatchObject({
      insertText: { location: { index: 13 }, text: "PRE" },
    });
  });
});

describe("update_document — schema validation", () => {
  it("rejects missing searchText when insertLocation = after_text", async () => {
    await expect(
      updateDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          insertLocation: "after_text",
          content: "X",
        },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(/searchText is required/);
  });

  it("rejects missing searchText when insertLocation = before_text", async () => {
    await expect(
      updateDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          insertLocation: "before_text",
          content: "X",
        },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(/searchText is required/);
  });

  it("rejects unknown insertLocation values (strict enum)", async () => {
    await expect(
      updateDocument({
        workflowId: "w",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          insertLocation: "middle",
          content: "X",
        },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow();
  });
});

describe("update_document — output shape", () => {
  it("returns documentId / documentUrl / title / updatedAt / contentLength / insertionLocation", async () => {
    mockDocumentsGet.mockResolvedValueOnce(docWithBody("body", "My Title"));
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    const result = await updateDocument({
      workflowId: "w",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        insertLocation: "end",
        content: "x-content",
      },
      triggerEvent: docsTrigger(),
    });
    expect(result.output.documentId).toBe("doc-1");
    expect(result.output.documentUrl).toBe(
      "https://docs.google.com/document/d/doc-1/edit",
    );
    expect(result.output.title).toBe("My Title");
    expect(result.output.contentLength).toBe("x-content".length);
    expect(result.output.insertionLocation).toBe("end");
    expect(result.output.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
