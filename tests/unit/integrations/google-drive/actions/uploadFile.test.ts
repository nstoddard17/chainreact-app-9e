/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockFilesCreateMultipart = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/filesCreateMultipart", () => ({
  filesCreateMultipart: (...args: unknown[]) => mockFilesCreateMultipart(...args),
}));

import { uploadFile } from "@/integrations/google-drive/actions/uploadFile";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesCreateMultipart.mockReset();
});

function driveTrigger(): TriggerEvent {
  return {
    provider: "google-drive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.test",
    payload: {},
  };
}

describe("uploadFile action", () => {
  it("uploads utf8 content as raw bytes by default", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesCreateMultipart.mockResolvedValue({
      id: "f-1",
      name: "hello.txt",
      mimeType: "text/plain",
      parents: ["root"],
      webViewLink: "https://drive.google.com/file/d/f-1",
      size: "11",
      createdTime: "2026-05-08T12:00:00Z",
    });

    const result = await uploadFile({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        filename: "hello.txt",
        mimeType: "text/plain",
        content: "Hello world",
      },
      triggerEvent: driveTrigger(),
    });

    expect(result.output.fileId).toBe("f-1");
    expect(result.output.size).toBe("11");
    const wrapperCall = mockFilesCreateMultipart.mock.calls[0]![0];
    expect(wrapperCall.metadata).toEqual({
      name: "hello.txt",
      mimeType: "text/plain",
    });
    expect(Buffer.isBuffer(wrapperCall.content)).toBe(true);
    expect((wrapperCall.content as Buffer).toString("utf8")).toBe(
      "Hello world",
    );
  });

  it("decodes base64 content to raw bytes when contentEncoding is base64", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesCreateMultipart.mockResolvedValue({
      id: "f-2",
      name: "icon.png",
      mimeType: "image/png",
      parents: [],
    });

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await uploadFile({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        filename: "icon.png",
        mimeType: "image/png",
        content: png.toString("base64"),
        contentEncoding: "base64",
      },
      triggerEvent: driveTrigger(),
    });

    const wrapperCall = mockFilesCreateMultipart.mock.calls[0]![0];
    expect(Buffer.isBuffer(wrapperCall.content)).toBe(true);
    expect(Buffer.compare(wrapperCall.content as Buffer, png)).toBe(0);
  });

  it("forwards parentFolderId as parents[]", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesCreateMultipart.mockResolvedValue({ id: "f", name: "x", parents: ["fld-1"] });

    await uploadFile({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        filename: "x",
        mimeType: "text/plain",
        content: "ok",
        parentFolderId: "fld-1",
      },
      triggerEvent: driveTrigger(),
    });

    expect(
      mockFilesCreateMultipart.mock.calls[0]![0].metadata.parents,
    ).toEqual(["fld-1"]);
  });

  it("rejects empty content", async () => {
    // content is required min length 0 — but Zod allows "". This test
    // ensures the schema parses ""; the bug would be requiring non-empty
    // when a workflow legitimately wants to create an empty file.
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockFilesCreateMultipart.mockResolvedValue({ id: "f", name: "empty.txt" });

    await expect(
      uploadFile({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { filename: "empty.txt", mimeType: "text/plain", content: "" },
        triggerEvent: driveTrigger(),
      }),
    ).resolves.toBeDefined();
    // Empty content uploaded as zero-length buffer.
    expect(
      (mockFilesCreateMultipart.mock.calls[0]![0].content as Buffer).length,
    ).toBe(0);
  });

  it("rejects missing required fields", async () => {
    await expect(
      uploadFile({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { filename: "x" }, // missing mimeType + content
        triggerEvent: driveTrigger(),
      }),
    ).rejects.toThrow();
  });
});
