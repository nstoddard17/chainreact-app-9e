/**
 * @jest-environment node
 *
 * Tests for the send_email action handler. Mocks refreshAndRetry +
 * sendMail wrapper + (for Outlook Mail 2.1 Commit 4) fetchFileBytes +
 * the workflow-files storage adapter so we exercise the parseRecipients
 * glue, Q11 schema enforcement, account resolution, attachment
 * resolution, size caps, and error pass-through without touching real
 * Graph / real OAuth / real Supabase.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSendMail = jest.fn();
const mockFetchFileBytes = jest.fn();
const mockCreateStorageAdapter = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-outlook/api/sendMail", () => ({
  sendMail: (...args: unknown[]) => mockSendMail(...args),
}));

class UnsupportedProviderFetchError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(
      `fetchFileBytes: 'provider_url' for provider '${provider}' is not supported yet.`,
    );
    this.name = "UnsupportedProviderFetchError";
    this.provider = provider;
  }
}

jest.mock("@/core/files/fetchFileBytes", () => ({
  WORKFLOW_FILES_BUCKET: "workflow-files",
  fetchFileBytes: (...args: unknown[]) => mockFetchFileBytes(...args),
  UnsupportedProviderFetchError,
  FileFetchError: class extends Error {},
  buildStoragePath: () => "",
}));

jest.mock(
  "@/services/files/createWorkflowFilesStorageAdapter",
  () => ({
    createWorkflowFilesStorageAdapter: (...args: unknown[]) =>
      mockCreateStorageAdapter(...args),
  }),
);

import { sendEmail } from "@/integrations/microsoft-outlook/actions/sendEmail";
import { SendEmailConfigSchema } from "@/integrations/microsoft-outlook/actions/sendEmail.schema";

const STORAGE_ADAPTER_SENTINEL = { download: jest.fn() };

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSendMail.mockReset();
  mockFetchFileBytes.mockReset();
  mockCreateStorageAdapter.mockReset();
  mockCreateStorageAdapter.mockReturnValue(STORAGE_ADAPTER_SENTINEL);
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

const BASE_CONFIG = {
  to: "alice@example.test",
  subject: "Hello",
  body: "Hi",
  isHtml: false,
  importance: "normal" as const,
};

describe("send_email action", () => {
  it("forwards parsed recipients + subject + body + importance to sendMail", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("ms-token"),
    );
    mockSendMail.mockResolvedValue(undefined);

    const result = await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...BASE_CONFIG,
        to: "alice@example.test, bob@example.test",
        cc: "carol@example.test",
        bcc: "dan@example.test",
        subject: "Hi all",
        body: "<p>Hello</p>",
        isHtml: true,
        importance: "high",
      },
      triggerEvent: trigger(),
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "ms-token",
        message: {
          subject: "Hi all",
          body: { contentType: "HTML", content: "<p>Hello</p>" },
          toRecipients: [
            { emailAddress: { address: "alice@example.test" } },
            { emailAddress: { address: "bob@example.test" } },
          ],
          ccRecipients: [
            { emailAddress: { address: "carol@example.test" } },
          ],
          bccRecipients: [
            { emailAddress: { address: "dan@example.test" } },
          ],
          importance: "high",
        },
        saveToSentItems: true,
      }),
    );

    expect(result.output).toEqual({
      sent: true,
      to: ["alice@example.test", "bob@example.test"],
      cc: ["carol@example.test"],
      bcc: ["dan@example.test"],
      subject: "Hi all",
      isHtml: true,
      importance: "high",
    });
  });

  it("uses 'Text' contentType when isHtml=false", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { ...BASE_CONFIG, isHtml: false },
      triggerEvent: trigger(),
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          body: { contentType: "Text", content: "Hi" },
        }),
      }),
    );
  });

  it("accepts to as an array (parseRecipients flattens)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...BASE_CONFIG,
        to: ["alice@example.test", "bob@example.test, carol@example.test"],
      },
      triggerEvent: trigger(),
    });

    const call = mockSendMail.mock.calls[0]![0];
    expect(call.message.toRecipients).toEqual([
      { emailAddress: { address: "alice@example.test" } },
      { emailAddress: { address: "bob@example.test" } },
      { emailAddress: { address: "carol@example.test" } },
    ]);
  });

  it("omits ccRecipients/bccRecipients when not provided (cleaner Graph payload)", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    const call = mockSendMail.mock.calls[0]![0];
    expect(call.message.ccRecipients).toBeUndefined();
    expect(call.message.bccRecipients).toBeUndefined();
  });

  it("rejects when `to` parses to an empty list (whitespace-only CSV)", async () => {
    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ...BASE_CONFIG, to: "   ,   " },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/at least one address in `to`/);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("threads accountId through when trigger came from microsoft-outlook", async () => {
    mockRefreshAndRetry.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger("microsoft-outlook"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        providerAccountId: "alice@contoso.com",
      }),
    );
  });

  it("passes accountId: null when trigger came from a different provider", async () => {
    mockRefreshAndRetry.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger("gmail"),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook",
        providerAccountId: null,
      }),
    );
  });

  it("rejects missing isHtml at the schema layer (Q11)", async () => {
    const { isHtml: _isHtml, ...rest } = BASE_CONFIG;
    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("rejects missing importance at the schema layer (Q11)", async () => {
    const { importance: _importance, ...rest } = BASE_CONFIG;
    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: rest,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("graph-boom"));

    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: BASE_CONFIG,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/graph-boom/);
  });

  // ── Outlook Mail 2.1 Commit 4 — attachments (P-O2 fileAttachment-only) ──

  it("preserves the existing wrapper call shape when no attachments are supplied", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: BASE_CONFIG,
      triggerEvent: trigger(),
    });

    const call = mockSendMail.mock.calls[0]![0];
    // Critical: attachments key must NOT be on the message object when
    // no FileRefs are supplied. JSON.stringify drops undefined, but we
    // assert the observable shape at the handler-to-wrapper boundary.
    expect("attachments" in call.message).toBe(false);
    // No storage adapter constructed either — adapter creation is lazy.
    expect(mockCreateStorageAdapter).not.toHaveBeenCalled();
    expect(mockFetchFileBytes).not.toHaveBeenCalled();
  });

  it("preserves the existing wrapper call shape when attachments is an empty array", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { ...BASE_CONFIG, attachments: [] },
      triggerEvent: trigger(),
    });

    const call = mockSendMail.mock.calls[0]![0];
    expect("attachments" in call.message).toBe(false);
    expect(mockCreateStorageAdapter).not.toHaveBeenCalled();
    expect(mockFetchFileBytes).not.toHaveBeenCalled();
  });

  it("resolves a signed_url FileRef to a Graph fileAttachment without constructing the storage adapter", async () => {
    const signedRef = {
      kind: "signed_url" as const,
      name: "invoice.pdf",
      mimeType: "application/pdf",
      url: "https://example.test/signed/invoice.pdf",
    };
    const bytes = new TextEncoder().encode("pdf bytes");
    mockFetchFileBytes.mockResolvedValue({
      bytes,
      name: signedRef.name,
      mimeType: signedRef.mimeType,
      sizeBytes: bytes.byteLength,
    });
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { ...BASE_CONFIG, attachments: [signedRef] },
      triggerEvent: trigger(),
    });

    // Adapter is NOT constructed for an all-signed_url payload (lazy).
    expect(mockCreateStorageAdapter).not.toHaveBeenCalled();
    // fetchFileBytes called with the signed ref + no storage option.
    // (Zod parse re-creates the config object, so the ref handed to
    // fetchFileBytes is a deep-equal copy, not the same reference.)
    expect(mockFetchFileBytes).toHaveBeenCalledTimes(1);
    expect(mockFetchFileBytes.mock.calls[0]![0]).toEqual(signedRef);

    const call = mockSendMail.mock.calls[0]![0];
    expect(call.message.attachments).toEqual([
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: "invoice.pdf",
        contentType: "application/pdf",
        // Base64 of "pdf bytes".
        contentBytes: Buffer.from(bytes).toString("base64"),
      },
    ]);
  });

  it("resolves a v2_storage FileRef through the workflow-files storage adapter", async () => {
    const v2Ref = {
      kind: "v2_storage" as const,
      name: "report.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      storagePath: "u/wf/r/n/report.docx",
      provider: "slack",
    };
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK header
    mockFetchFileBytes.mockResolvedValue({
      bytes,
      name: v2Ref.name,
      mimeType: v2Ref.mimeType,
      sizeBytes: bytes.byteLength,
    });
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    await sendEmail({
      workflowId: "wf",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "r-1",
      nodeId: "n-1",
      config: { ...BASE_CONFIG, attachments: [v2Ref] },
      triggerEvent: trigger(),
    });

    // Adapter constructed exactly once with the audit reason carrying
    // the (provider:action run=...) shape.
    expect(mockCreateStorageAdapter).toHaveBeenCalledTimes(1);
    expect(mockCreateStorageAdapter).toHaveBeenCalledWith({
      reason: "microsoft-outlook:send_email run=r-1 node=n-1",
    });

    // fetchFileBytes invoked with the storage adapter passed through.
    // (Same Zod-reparses-the-config note as above.)
    expect(mockFetchFileBytes).toHaveBeenCalledTimes(1);
    expect(mockFetchFileBytes.mock.calls[0]![0]).toEqual(v2Ref);
    expect(mockFetchFileBytes.mock.calls[0]![1]).toEqual({
      storage: STORAGE_ADAPTER_SENTINEL,
    });

    const call = mockSendMail.mock.calls[0]![0];
    expect(call.message.attachments).toEqual([
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: "report.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        contentBytes: Buffer.from(bytes).toString("base64"),
      },
    ]);
  });

  it("rejects a provider_url FileRef BEFORE any Graph call (P-S3 plan §10 #1)", async () => {
    const providerRef = {
      kind: "provider_url" as const,
      name: "thing.png",
      mimeType: "image/png",
      url: "https://files.slack.com/x/y/z",
      provider: "slack",
    };

    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ...BASE_CONFIG, attachments: [providerRef] },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/provider_url/);

    // Never reached the Graph call.
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
    // Never even fetched the bytes — provider_url is short-circuited.
    expect(mockFetchFileBytes).not.toHaveBeenCalled();
  });

  it("rejects a single attachment that exceeds the 3 MB per-attachment cap", async () => {
    const bigBytes = new Uint8Array(3 * 1024 * 1024 + 1); // 3 MB + 1 byte
    mockFetchFileBytes.mockResolvedValue({
      bytes: bigBytes,
      name: "huge.bin",
      mimeType: "application/octet-stream",
      sizeBytes: bigBytes.byteLength,
    });

    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          ...BASE_CONFIG,
          attachments: [
            {
              kind: "signed_url",
              name: "huge.bin",
              mimeType: "application/octet-stream",
              url: "https://example.test/huge",
            },
          ],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/per-attachment cap/);

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("rejects when total attachment payload exceeds the 25 MB total cap", async () => {
    // 13 × 2 MB = 26 MB total; each under the 3 MB per-attachment cap.
    const oneFile = new Uint8Array(2 * 1024 * 1024);
    mockFetchFileBytes.mockResolvedValue({
      bytes: oneFile,
      name: "two-mb.bin",
      mimeType: "application/octet-stream",
      sizeBytes: oneFile.byteLength,
    });

    const refs = Array.from({ length: 13 }, (_, i) => ({
      kind: "signed_url" as const,
      name: `chunk-${i}.bin`,
      mimeType: "application/octet-stream",
      url: `https://example.test/chunk-${i}`,
    }));

    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { ...BASE_CONFIG, attachments: refs },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/total cap/);

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("propagates fetchFileBytes errors (network / storage failure) without calling Graph", async () => {
    mockFetchFileBytes.mockRejectedValue(
      new Error("fetchFileBytes (kind=signed_url) failed: HTTP 403"),
    );

    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          ...BASE_CONFIG,
          attachments: [
            {
              kind: "signed_url",
              name: "a.bin",
              mimeType: "application/octet-stream",
              url: "https://example.test/a",
            },
          ],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/HTTP 403/);

    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("output shape does NOT include attachments / contentBytes / base64 / bytes (CLAUDE.md rule #1)", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    mockFetchFileBytes.mockResolvedValue({
      bytes,
      name: "x.bin",
      mimeType: "application/octet-stream",
      sizeBytes: bytes.byteLength,
    });
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
      apiCall("t"),
    );
    mockSendMail.mockResolvedValue(undefined);

    const result = await sendEmail({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        ...BASE_CONFIG,
        attachments: [
          {
            kind: "signed_url",
            name: "x.bin",
            mimeType: "application/octet-stream",
            url: "https://example.test/x",
          },
        ],
      },
      triggerEvent: trigger(),
    });

    // Output shape is unchanged from pre-2.1 — no bytes, no base64, no
    // attachments field. Workflow authors who need attachment metadata
    // downstream reference the upstream FileRef-producing node, not
    // send_email's output.
    expect(result.output).toEqual({
      sent: true,
      to: ["alice@example.test"],
      cc: [],
      bcc: [],
      subject: "Hello",
      isHtml: false,
      importance: "normal",
    });
    expect(
      "attachments" in (result.output as Record<string, unknown>),
    ).toBe(false);
    expect(
      "contentBytes" in (result.output as Record<string, unknown>),
    ).toBe(false);
    expect("base64" in (result.output as Record<string, unknown>)).toBe(
      false,
    );
    expect("bytes" in (result.output as Record<string, unknown>)).toBe(
      false,
    );
  });

  it("Graph wrapper error propagation still works WITH attachments present", async () => {
    mockFetchFileBytes.mockResolvedValue({
      bytes: new Uint8Array([1]),
      name: "a.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
    });
    mockRefreshAndRetry.mockRejectedValue(new Error("graph-boom"));

    await expect(
      sendEmail({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          ...BASE_CONFIG,
          attachments: [
            {
              kind: "signed_url",
              name: "a.txt",
              mimeType: "text/plain",
              url: "https://example.test/a",
            },
          ],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/graph-boom/);
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling sendEmail.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Tests for the send_email config schema. Q11 contract — `isHtml` and
// `importance` are REQUIRED with no hidden defaults; subject/body must
// be present even if empty; `to` is required and accepts string OR array;
// cc/bcc are optional; strict mode rejects unknowns.
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  to: "alice@example.test",
  subject: "Hello",
  body: "Hi",
  isHtml: false,
  importance: "normal" as const,
};

describe("SendEmailConfigSchema", () => {
  it("accepts the minimal valid config (all required fields present)", () => {
    expect(() => SendEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts to as a string", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: "a@x.com, b@x.com",
      }),
    ).not.toThrow();
  });

  it("accepts to as an array of strings", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        to: ["a@x.com", "b@x.com"],
      }),
    ).not.toThrow();
  });

  it("accepts cc and bcc as either string or array", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        cc: "c@x.com",
        bcc: ["d@x.com"],
      }),
    ).not.toThrow();
  });

  it("allows empty subject (mirrors Gmail policy — Microsoft accepts no-subject)", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, subject: "" }),
    ).not.toThrow();
  });

  it("allows empty body", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, body: "" }),
    ).not.toThrow();
  });

  it("rejects missing to (Gmail-style required-recipient policy)", () => {
    const { to: _to, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects empty string to", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, to: "" }),
    ).toThrow();
  });

  it("rejects empty array to", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, to: [] }),
    ).toThrow();
  });

  it("rejects missing isHtml (Q11 — no hidden default)", () => {
    const { isHtml: _isHtml, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing importance (Q11 — no hidden default)", () => {
    const { importance: _importance, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing subject (must be present even if empty)", () => {
    const { subject: _subject, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects missing body (must be present even if empty)", () => {
    const { body: _body, ...rest } = VALID_CONFIG;
    expect(() => SendEmailConfigSchema.parse(rest)).toThrow();
  });

  it("rejects invalid importance values", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        importance: "urgent",
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        unknownExtra: "leak",
      }),
    ).toThrow();
  });

  // ── Outlook Mail 2.1 Commit 4 — attachments field ─────────────────────

  it("accepts a config with attachments absent", () => {
    expect(() => SendEmailConfigSchema.parse(VALID_CONFIG)).not.toThrow();
  });

  it("accepts a config with an empty attachments array", () => {
    expect(() =>
      SendEmailConfigSchema.parse({ ...VALID_CONFIG, attachments: [] }),
    ).not.toThrow();
  });

  it("accepts a valid v2_storage FileRef in attachments", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "v2_storage",
            name: "invoice.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12345,
            storagePath: "u/wf/r/n/invoice.pdf",
            provider: "slack",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts a valid signed_url FileRef in attachments", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "signed_url",
            name: "report.docx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            url: "https://example.test/signed-url-123",
            expiresAt: "2026-05-15T12:00:00Z",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts a valid provider_url FileRef at the schema layer (handler rejects)", () => {
    // The schema layer can't reject provider_url — it's a valid FileRef
    // shape. The handler rejects this kind with UnsupportedProviderFetchError
    // before any Graph call. This is exercised in the handler tests.
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "provider_url",
            name: "thing.png",
            mimeType: "image/png",
            url: "https://files.slack.com/x/y/z",
            provider: "slack",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects inline-bytes attachment shape (content / bytes / base64 / data)", () => {
    // FileRefSchema's strict-arms reject any unknown field — confirms
    // the contract enforces "no inline bytes in action inputs."
    const inlineShapes = [
      { content: "raw" },
      { bytes: [1, 2, 3] },
      { base64: "Zm9v" },
      { data: "{...}" },
    ];
    for (const inline of inlineShapes) {
      expect(() =>
        SendEmailConfigSchema.parse({
          ...VALID_CONFIG,
          attachments: [
            {
              kind: "v2_storage",
              name: "x.txt",
              mimeType: "text/plain",
              storagePath: "u/wf/r/n/x.txt",
              ...inline,
            },
          ],
        }),
      ).toThrow();
    }
  });

  it("rejects an attachment with an unknown kind", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "magical",
            name: "x.txt",
            mimeType: "text/plain",
          } as unknown as Record<string, unknown>,
        ],
      }),
    ).toThrow();
  });

  it("rejects an attachment missing required FileRef fields (name / mimeType / discriminator)", () => {
    expect(() =>
      SendEmailConfigSchema.parse({
        ...VALID_CONFIG,
        attachments: [
          {
            kind: "v2_storage",
            // missing name
            mimeType: "text/plain",
            storagePath: "u/wf/r/n/x.txt",
          } as unknown as Record<string, unknown>,
        ],
      }),
    ).toThrow();
  });
});
