/**
 * @jest-environment node
 *
 * Tests for get_attachment action handler. P-O2 fileAttachment-only;
 * SKIP stubs for itemAttachment / referenceAttachment; per-attachment
 * failures log-and-continue; no byte leakage in output.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockListAttachments = jest.fn();
const mockGetAttachment = jest.fn();
const mockStageFileToStorage = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/listAttachments", () => ({
  listAttachments: (...args: unknown[]) => mockListAttachments(...args),
}));

jest.mock("@/integrations/microsoft-outlook/api/getAttachment", () => ({
  getAttachment: (...args: unknown[]) => mockGetAttachment(...args),
}));

jest.mock("@/services/files/stageFileToStorage", () => ({
  stageFileToStorage: (...args: unknown[]) =>
    mockStageFileToStorage(...args),
}));

import { getAttachment } from "@/integrations/microsoft-outlook/actions/getAttachment";
import { GetAttachmentConfigSchema } from "@/integrations/microsoft-outlook/actions/getAttachment.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockListAttachments.mockReset();
  mockGetAttachment.mockReset();
  mockStageFileToStorage.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
    apiCall("ms-token"),
  );
});

function trigger(provider: string = "microsoft-outlook"): TriggerEvent {
  return {
    provider,
    eventType: "new_email",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

function fileAttachmentEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    "@odata.type": "#microsoft.graph.fileAttachment" as const,
    id: "att-1",
    name: "report.pdf",
    contentType: "application/pdf",
    size: 5,
    contentBytes: Buffer.from("hello").toString("base64"),
    ...overrides,
  };
}

function stagedRef(overrides: Record<string, unknown> = {}) {
  return {
    ref: {
      kind: "v2_storage" as const,
      provider: "microsoft-outlook",
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
      storagePath: "user/wf/run/node/report.pdf",
      ...overrides,
    },
    record: {
      id: "rec-1",
      fileName: "report.pdf",
    },
  };
}

function baseInput() {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    triggerEvent: trigger(),
  };
}

describe("get_attachment — happy path", () => {
  it("stages a fileAttachment via stageFileToStorage and emits a FileRef", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "att-1",
          name: "report.pdf",
          contentType: "application/pdf",
          size: 5,
          isInline: false,
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    mockGetAttachment.mockResolvedValueOnce(fileAttachmentEnvelope());
    mockStageFileToStorage.mockResolvedValueOnce(stagedRef());

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });

    expect(mockStageFileToStorage).toHaveBeenCalledTimes(1);
    const stageCall = mockStageFileToStorage.mock.calls[0]![0];
    expect(stageCall.userId).toBe("u");
    expect(stageCall.workflowId).toBe("wf");
    expect(stageCall.runId).toBe("r");
    expect(stageCall.nodeId).toBe("n");
    expect(stageCall.fileName).toBe("report.pdf");
    expect(stageCall.mimeType).toBe("application/pdf");
    expect(stageCall.bytes).toBeInstanceOf(Uint8Array);
    expect(stageCall.provider).toBe("microsoft-outlook");

    const attachments = result.output.attachments as Array<
      Record<string, unknown>
    >;
    expect(attachments).toHaveLength(1);
    expect(attachments[0]!.subtype).toBe("fileAttachment");
    expect(attachments[0]!.skipped).toBe(false);
    expect(attachments[0]!.file).toBeDefined();
    expect(result.output.downloadedCount).toBe(1);
    expect(result.output.count).toBe(1);
    expect(result.output.totalSize).toBe(5);
  });

  it("dispatches list + per-id GETs through refreshAndRetry", async () => {
    mockListAttachments.mockResolvedValueOnce({ value: [] });
    await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });
    // 1 refreshAndRetry call for the LIST; per-id GETs only fire when
    // there's at least one attachment, so 1 total here.
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
  });

  it("threads accountId when trigger came from microsoft-outlook", async () => {
    mockListAttachments.mockResolvedValueOnce({ value: [] });
    await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
      triggerEvent: trigger("microsoft-outlook"),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ providerAccountId: "alice@contoso.com" }),
    );
  });

  it("passes accountId: null when trigger came from a different provider", async () => {
    mockListAttachments.mockResolvedValueOnce({ value: [] });
    await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
      triggerEvent: trigger("slack"),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ providerAccountId: null }),
    );
  });
});

describe("get_attachment — filters", () => {
  it("excludes inline attachments by default", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "inline-img",
          name: "embedded.png",
          isInline: true,
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
        {
          id: "real-file",
          name: "report.pdf",
          isInline: false,
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    mockGetAttachment.mockResolvedValueOnce(
      fileAttachmentEnvelope({ id: "real-file", name: "report.pdf" }),
    );
    mockStageFileToStorage.mockResolvedValueOnce(stagedRef());

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });

    // Per-id GET only invoked for the non-inline attachment.
    expect(mockGetAttachment).toHaveBeenCalledTimes(1);
    expect(mockGetAttachment.mock.calls[0]![0].attachmentId).toBe(
      "real-file",
    );
    expect((result.output.attachments as unknown[]).length).toBe(1);
  });

  it("INCLUDES inline attachments when excludeInline=false", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "inline-img",
          name: "embedded.png",
          isInline: true,
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    mockGetAttachment.mockResolvedValueOnce(
      fileAttachmentEnvelope({ id: "inline-img", name: "embedded.png" }),
    );
    mockStageFileToStorage.mockResolvedValueOnce(stagedRef());

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1", excludeInline: false },
    });

    expect(mockGetAttachment).toHaveBeenCalledTimes(1);
    expect((result.output.attachments as unknown[]).length).toBe(1);
  });

  it("filters by_extension (case-insensitive, leading dot stripped)", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "a",
          name: "report.PDF",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
        {
          id: "b",
          name: "image.jpg",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    mockGetAttachment.mockResolvedValueOnce(
      fileAttachmentEnvelope({ id: "a", name: "report.PDF" }),
    );
    mockStageFileToStorage.mockResolvedValueOnce(stagedRef());

    const result = await getAttachment({
      ...baseInput(),
      config: {
        emailId: "msg-1",
        downloadMode: "by_extension",
        fileExtensions: ".pdf",
      },
    });

    expect(mockGetAttachment).toHaveBeenCalledTimes(1);
    expect(mockGetAttachment.mock.calls[0]![0].attachmentId).toBe("a");
    expect((result.output.attachments as unknown[]).length).toBe(1);
  });

  it("filters by_extension via CSV input", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "a",
          name: "x.pdf",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
        {
          id: "b",
          name: "y.docx",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
        {
          id: "c",
          name: "z.jpg",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    mockGetAttachment
      .mockResolvedValueOnce(fileAttachmentEnvelope({ id: "a", name: "x.pdf" }))
      .mockResolvedValueOnce(
        fileAttachmentEnvelope({ id: "b", name: "y.docx" }),
      );
    mockStageFileToStorage
      .mockResolvedValueOnce(stagedRef())
      .mockResolvedValueOnce(stagedRef());

    await getAttachment({
      ...baseInput(),
      config: {
        emailId: "msg-1",
        downloadMode: "by_extension",
        fileExtensions: "pdf, docx",
      },
    });

    expect(mockGetAttachment).toHaveBeenCalledTimes(2);
  });

  it("filters by_name (case-insensitive substring)", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "a",
          name: "Q3 Report 2026.pdf",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
        {
          id: "b",
          name: "photo.jpg",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    mockGetAttachment.mockResolvedValueOnce(
      fileAttachmentEnvelope({ id: "a", name: "Q3 Report 2026.pdf" }),
    );
    mockStageFileToStorage.mockResolvedValueOnce(stagedRef());

    await getAttachment({
      ...baseInput(),
      config: {
        emailId: "msg-1",
        downloadMode: "by_name",
        fileNameFilter: "report",
      },
    });

    expect(mockGetAttachment).toHaveBeenCalledTimes(1);
    expect(mockGetAttachment.mock.calls[0]![0].attachmentId).toBe("a");
  });

  it("rejects post-parse when downloadMode='by_extension' but fileExtensions is missing", async () => {
    await expect(
      getAttachment({
        ...baseInput(),
        config: {
          emailId: "msg-1",
          downloadMode: "by_extension",
          // fileExtensions intentionally omitted
        },
      }),
    ).rejects.toThrow(/fileExtensions/);
    expect(mockListAttachments).not.toHaveBeenCalled();
  });

  it("rejects post-parse when downloadMode='by_name' but fileNameFilter is missing", async () => {
    await expect(
      getAttachment({
        ...baseInput(),
        config: {
          emailId: "msg-1",
          downloadMode: "by_name",
        },
      }),
    ).rejects.toThrow(/fileNameFilter/);
    expect(mockListAttachments).not.toHaveBeenCalled();
  });
});

describe("get_attachment — P-O2 SKIP subtypes", () => {
  it("emits a skipped stub for itemAttachment (no stage call)", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "item-1",
          name: "Forwarded message",
          "@odata.type": "#microsoft.graph.itemAttachment",
        },
      ],
    });
    mockGetAttachment.mockResolvedValueOnce({
      "@odata.type": "#microsoft.graph.itemAttachment",
      id: "item-1",
      name: "Forwarded message",
      contentType: "message/rfc822",
      size: 500,
      item: { "@odata.type": "#microsoft.graph.message" },
    });

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });

    expect(mockStageFileToStorage).not.toHaveBeenCalled();
    const attachments = result.output.attachments as Array<
      Record<string, unknown>
    >;
    expect(attachments[0]).toMatchObject({
      subtype: "itemAttachment",
      skipped: true,
      reason: expect.stringContaining("itemAttachment"),
    });
    expect(result.output.downloadedCount).toBe(0);
  });

  it("emits a skipped stub for referenceAttachment (no stage call)", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "ref-1",
          name: "OneDrive file",
          "@odata.type": "#microsoft.graph.referenceAttachment",
        },
      ],
    });
    mockGetAttachment.mockResolvedValueOnce({
      "@odata.type": "#microsoft.graph.referenceAttachment",
      id: "ref-1",
      name: "OneDrive file",
      contentType: "application/octet-stream",
      size: 100,
      sourceUrl: "https://onedrive.example/file",
    });

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });

    expect(mockStageFileToStorage).not.toHaveBeenCalled();
    const attachments = result.output.attachments as Array<
      Record<string, unknown>
    >;
    expect(attachments[0]).toMatchObject({
      subtype: "referenceAttachment",
      skipped: true,
      reason: expect.stringContaining("referenceAttachment"),
    });
  });

  it("processes a mixed batch (1 fileAttachment + 1 itemAttachment) — downloadedCount counts only ported", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "file-1",
          name: "report.pdf",
          "@odata.type": "#microsoft.graph.fileAttachment",
          size: 5,
        },
        {
          id: "item-1",
          name: "Forwarded",
          "@odata.type": "#microsoft.graph.itemAttachment",
          size: 200,
        },
      ],
    });
    mockGetAttachment
      .mockResolvedValueOnce(fileAttachmentEnvelope({ id: "file-1" }))
      .mockResolvedValueOnce({
        "@odata.type": "#microsoft.graph.itemAttachment",
        id: "item-1",
        name: "Forwarded",
        size: 200,
      });
    mockStageFileToStorage.mockResolvedValueOnce(stagedRef());

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });

    expect(result.output.count).toBe(2);
    expect(result.output.downloadedCount).toBe(1);
    expect(result.output.totalSize).toBe(205);
  });
});

describe("get_attachment — error handling", () => {
  it("per-attachment GET failures log-and-continue; overall action succeeds", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "fails",
          name: "broken.pdf",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
        {
          id: "succeeds",
          name: "report.pdf",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    mockGetAttachment
      .mockRejectedValueOnce(new Error("Microsoft Graph GET failed: HTTP 500"))
      .mockResolvedValueOnce(
        fileAttachmentEnvelope({ id: "succeeds", name: "report.pdf" }),
      );
    mockStageFileToStorage.mockResolvedValueOnce(stagedRef());

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });

    expect((result.output.attachments as unknown[]).length).toBe(1);
    expect(result.output.downloadedCount).toBe(1);
  });

  it("stageFileToStorage failures log-and-continue", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "att",
          name: "report.pdf",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    mockGetAttachment.mockResolvedValueOnce(fileAttachmentEnvelope());
    mockStageFileToStorage.mockRejectedValueOnce(
      new Error("files.stage upload failed"),
    );

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });

    expect((result.output.attachments as unknown[]).length).toBe(0);
    expect(result.output.downloadedCount).toBe(0);
  });

  it("propagates a LIST call failure (entire action fails)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Microsoft Graph GET /attachments failed: HTTP 404"),
    );

    await expect(
      getAttachment({
        ...baseInput(),
        config: { emailId: "missing-msg" },
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("rejects missing emailId at the schema layer", async () => {
    await expect(
      getAttachment({
        ...baseInput(),
        config: {},
      }),
    ).rejects.toThrow();
    expect(mockListAttachments).not.toHaveBeenCalled();
  });
});

describe("get_attachment — no bytes / contentBytes / base64 in output", () => {
  it("returns FileRef + metadata only (no raw bytes in the output)", async () => {
    mockListAttachments.mockResolvedValueOnce({
      value: [
        {
          id: "att-1",
          name: "report.pdf",
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    });
    mockGetAttachment.mockResolvedValueOnce(fileAttachmentEnvelope());
    mockStageFileToStorage.mockResolvedValueOnce(stagedRef());

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });

    const serialized = JSON.stringify(result.output);
    expect(serialized).not.toMatch(/contentBytes/);
    expect(serialized).not.toMatch(/base64/);
    expect(serialized).not.toMatch(/"bytes"/);
    expect(serialized).not.toMatch(/"content"/);

    const attachments = result.output.attachments as Array<
      Record<string, unknown>
    >;
    expect("contentBytes" in attachments[0]!).toBe(false);
    expect("content" in attachments[0]!).toBe(false);
    expect("bytes" in attachments[0]!).toBe(false);
    expect("base64" in attachments[0]!).toBe(false);
    expect("data" in attachments[0]!).toBe(false);
  });

  it("empty list → { attachments: [], count: 0, downloadedCount: 0, totalSize: 0 }", async () => {
    mockListAttachments.mockResolvedValueOnce({ value: [] });

    const result = await getAttachment({
      ...baseInput(),
      config: { emailId: "msg-1" },
    });

    expect(result.output).toEqual({
      attachments: [],
      count: 0,
      downloadedCount: 0,
      totalSize: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling getAttachment.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  emailId: "AAMkAGI2",
};

describe("GetAttachmentConfigSchema", () => {
  it("accepts the minimal valid config (emailId only — defaults apply)", () => {
    const parsed = GetAttachmentConfigSchema.parse(VALID_CONFIG);
    expect(parsed.emailId).toBe("AAMkAGI2");
    expect(parsed.downloadMode).toBe("all");
    expect(parsed.excludeInline).toBe(true);
  });

  it("applies D-OM3 defaults: downloadMode='all', excludeInline=true", () => {
    const parsed = GetAttachmentConfigSchema.parse({ emailId: "msg" });
    expect(parsed.downloadMode).toBe("all");
    expect(parsed.excludeInline).toBe(true);
  });

  it("rejects missing emailId", () => {
    expect(() => GetAttachmentConfigSchema.parse({})).toThrow();
  });

  it("rejects empty-string emailId", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({ emailId: "" }),
    ).toThrow();
  });

  it("accepts downloadMode='by_extension' with fileExtensions string", () => {
    const parsed = GetAttachmentConfigSchema.parse({
      ...VALID_CONFIG,
      downloadMode: "by_extension",
      fileExtensions: "pdf,docx",
    });
    expect(parsed.downloadMode).toBe("by_extension");
    expect(parsed.fileExtensions).toBe("pdf,docx");
  });

  it("accepts fileExtensions as an array", () => {
    const parsed = GetAttachmentConfigSchema.parse({
      ...VALID_CONFIG,
      downloadMode: "by_extension",
      fileExtensions: ["pdf", "docx"],
    });
    expect(parsed.fileExtensions).toEqual(["pdf", "docx"]);
  });

  it("accepts downloadMode='by_name' with fileNameFilter", () => {
    const parsed = GetAttachmentConfigSchema.parse({
      ...VALID_CONFIG,
      downloadMode: "by_name",
      fileNameFilter: "report",
    });
    expect(parsed.downloadMode).toBe("by_name");
    expect(parsed.fileNameFilter).toBe("report");
  });

  it("rejects empty-string fileExtensions", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "by_extension",
        fileExtensions: "",
      }),
    ).toThrow();
  });

  it("rejects empty-array fileExtensions", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "by_extension",
        fileExtensions: [],
      }),
    ).toThrow();
  });

  it("rejects empty-string fileNameFilter", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "by_name",
        fileNameFilter: "",
      }),
    ).toThrow();
  });

  it("rejects unknown downloadMode", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "smart",
      }),
    ).toThrow();
  });

  it("rejects non-boolean excludeInline", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        excludeInline: "true" as unknown as boolean,
      }),
    ).toThrow();
  });

  it("accepts excludeInline=false", () => {
    const parsed = GetAttachmentConfigSchema.parse({
      ...VALID_CONFIG,
      excludeInline: false,
    });
    expect(parsed.excludeInline).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        leak: "x",
      }),
    ).toThrow();
  });

  it("schema does NOT enforce conditional-required (fileExtensions when downloadMode=by_extension); handler does that post-parse", () => {
    // The schema accepts `downloadMode: by_extension` without
    // `fileExtensions` — the handler catches it post-parse with a
    // clear error.
    expect(() =>
      GetAttachmentConfigSchema.parse({
        ...VALID_CONFIG,
        downloadMode: "by_extension",
      }),
    ).not.toThrow();
  });
});
