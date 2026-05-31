/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — google-docs:create_document action handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDocumentsCreate = jest.fn();
const mockDocumentsBatchUpdate = jest.fn();
const mockFilesUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/google/api/docs/documentsCreate", () => ({
  documentsCreate: (...args: unknown[]) => mockDocumentsCreate(...args),
}));

jest.mock("@/integrations/_shared/google/api/docs/documentsBatchUpdate", () => ({
  documentsBatchUpdate: (...args: unknown[]) => mockDocumentsBatchUpdate(...args),
}));

jest.mock("@/integrations/google-drive/api/filesUpdate", () => ({
  filesUpdate: (...args: unknown[]) => mockFilesUpdate(...args),
}));

import { createDocument } from "@/integrations/google-docs/actions/createDocument";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDocumentsCreate.mockReset();
  mockDocumentsBatchUpdate.mockReset();
  mockFilesUpdate.mockReset();

  // Default: refreshAndRetry passes through to the apiCall closure with
  // a stub access token.
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

function slackTrigger(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "message_received",
    eventId: "evt-2",
    occurredAt: "2026-05-23T12:00:00Z",
    providerAccountId: "T123",
    payload: {},
  };
}

describe("create_document — happy path", () => {
  it("creates an empty doc when content is empty (no batchUpdate call)", async () => {
    mockDocumentsCreate.mockResolvedValueOnce({
      documentId: "doc-1",
      title: "My Title",
    });
    const result = await createDocument({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { title: "My Title" },
      triggerEvent: docsTrigger(),
    });
    expect(mockDocumentsCreate).toHaveBeenCalledTimes(1);
    expect(mockDocumentsBatchUpdate).not.toHaveBeenCalled();
    expect(mockFilesUpdate).not.toHaveBeenCalled();
    expect(result.output.documentId).toBe("doc-1");
    expect(result.output.documentUrl).toBe(
      "https://docs.google.com/document/d/doc-1/edit",
    );
    expect(result.output.title).toBe("My Title");
    expect(result.output.folderId).toBeNull();
  });

  it("inserts content via documents.batchUpdate when content is non-empty", async () => {
    mockDocumentsCreate.mockResolvedValueOnce({
      documentId: "doc-1",
      title: "My Title",
    });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    await createDocument({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { title: "T", content: "hello body" },
      triggerEvent: docsTrigger(),
    });
    expect(mockDocumentsBatchUpdate).toHaveBeenCalledTimes(1);
    const args = mockDocumentsBatchUpdate.mock.calls[0]![0]! as {
      requests: ReadonlyArray<Record<string, unknown>>;
    };
    expect(args.requests).toEqual([
      { insertText: { location: { index: 1 }, text: "hello body" } },
    ]);
  });

  it("moves the doc into the requested folder via files.update?addParents=", async () => {
    mockDocumentsCreate.mockResolvedValueOnce({ documentId: "doc-1" });
    mockDocumentsBatchUpdate.mockResolvedValueOnce({ documentId: "doc-1" });
    mockFilesUpdate.mockResolvedValueOnce({ id: "doc-1" });
    await createDocument({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { title: "T", content: "x", folderId: "fld-123" },
      triggerEvent: docsTrigger(),
    });
    expect(mockFilesUpdate).toHaveBeenCalledTimes(1);
    const args = mockFilesUpdate.mock.calls[0]![0]! as {
      fileId: string;
      addParents: string;
    };
    expect(args.fileId).toBe("doc-1");
    expect(args.addParents).toBe("fld-123");
  });

  it("passes accountId through when trigger is google-docs", async () => {
    mockDocumentsCreate.mockResolvedValueOnce({ documentId: "doc-1" });
    await createDocument({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { title: "T" },
      triggerEvent: docsTrigger(),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google-docs",
        providerAccountId: "alice@example.com",
      }),
    );
  });

  it("passes accountId=null when trigger is from another provider", async () => {
    mockDocumentsCreate.mockResolvedValueOnce({ documentId: "doc-1" });
    await createDocument({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { title: "T" },
      triggerEvent: slackTrigger(),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ providerAccountId: null }),
    );
  });
});

describe("create_document — schema validation", () => {
  it("rejects missing title", async () => {
    await expect(
      createDocument({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(/title is required/);
    expect(mockDocumentsCreate).not.toHaveBeenCalled();
  });

  it("rejects V1's contentSource field (file-upload deferred per D-GD1)", async () => {
    await expect(
      createDocument({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { title: "T", contentSource: "file_upload" },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(); // Zod strict rejects unknown key
    expect(mockDocumentsCreate).not.toHaveBeenCalled();
  });

  it("rejects V1's share fields on create_document (split into share_document)", async () => {
    await expect(
      createDocument({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { title: "T", enableSharing: true, emails: "a@b.com" },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow();
    expect(mockDocumentsCreate).not.toHaveBeenCalled();
  });
});
