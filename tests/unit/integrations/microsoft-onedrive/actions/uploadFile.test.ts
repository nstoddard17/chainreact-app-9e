/**
 * @jest-environment node
 */
import { Buffer } from "node:buffer";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpload = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-onedrive/api/driveItemsContentUpload",
  () => ({
    driveItemsContentUpload: (...args: unknown[]) => mockUpload(...args),
  }),
);

import { uploadFile } from "@/integrations/microsoft-onedrive/actions/uploadFile";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpload.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-onedrive",
    eventType: "file_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("upload_file action", () => {
  it("decodes utf8 content (default) and forwards to wrapper", async () => {
    mockUpload.mockResolvedValueOnce({
      id: "u-1",
      name: "a.txt",
      size: 5,
      file: { mimeType: "text/plain" },
      webUrl: "https://1drv.ms/x",
    });

    const result = await uploadFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        filename: "a.txt",
        mimeType: "text/plain",
        content: "hello",
      },
      triggerEvent: trigger(),
    });

    const call = mockUpload.mock.calls[0]![0];
    expect(call.filename).toBe("a.txt");
    expect(call.mimeType).toBe("text/plain");
    expect(Buffer.isBuffer(call.content)).toBe(true);
    expect(call.content.toString("utf8")).toBe("hello");
    expect(result.output).toEqual(
      expect.objectContaining({
        itemId: "u-1",
        name: "a.txt",
        size: 5,
        webUrl: "https://1drv.ms/x",
      }),
    );
  });

  it("decodes base64 content when contentEncoding='base64'", async () => {
    mockUpload.mockResolvedValueOnce({ id: "u", file: { mimeType: "image/png" } });

    await uploadFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        filename: "x.png",
        mimeType: "image/png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
        contentEncoding: "base64",
      },
      triggerEvent: trigger(),
    });

    const call = mockUpload.mock.calls[0]![0];
    expect(call.content.length).toBe(4);
    expect(call.content[0]).toBe(0x89); // PNG magic
  });

  it("forwards parentItemId when supplied", async () => {
    mockUpload.mockResolvedValueOnce({ id: "u" });

    await uploadFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        filename: "a.txt",
        mimeType: "text/plain",
        content: "x",
        parentItemId: "folder-1",
      },
      triggerEvent: trigger(),
    });

    expect(mockUpload.mock.calls[0]![0].parentItemId).toBe("folder-1");
  });

  it("threads microsoft-onedrive provider through refreshAndRetry", async () => {
    mockUpload.mockResolvedValueOnce({ id: "u" });

    await uploadFile({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { filename: "a", mimeType: "text/plain", content: "x" },
      triggerEvent: trigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u",
        provider: "microsoft-onedrive",
        accountId: "alice@contoso.com",
      }),
    );
  });

  it("rejects empty filename / mimeType / missing content (strict schema)", async () => {
    await expect(
      uploadFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { filename: "", mimeType: "text/plain", content: "x" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();

    await expect(
      uploadFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { filename: "a", mimeType: "", content: "x" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown fields (strict mode catches V1 sourceType / uploadedFiles leftovers)", async () => {
    await expect(
      uploadFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          filename: "a",
          mimeType: "text/plain",
          content: "x",
          sourceType: "file",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid contentEncoding values", async () => {
    await expect(
      uploadFile({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          filename: "a",
          mimeType: "text/plain",
          content: "x",
          contentEncoding: "binary",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
