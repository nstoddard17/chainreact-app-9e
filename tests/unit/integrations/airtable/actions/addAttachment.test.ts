/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpdate = jest.fn();
const mockCreateSignedUrl = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/airtable/api/records", () => ({
  recordsCreate: jest.fn(),
  recordsGet: jest.fn(),
  recordsList: jest.fn(),
  recordsUpdate: (...args: unknown[]) => mockUpdate(...args),
  recordsDelete: jest.fn(),
}));

jest.mock("@/services/files/createWorkflowFileSignedUrl", () => ({
  createWorkflowFileSignedUrl: (...args: unknown[]) =>
    mockCreateSignedUrl(...args),
}));

import {
  addAttachment,
  AirtableAddAttachmentConfigError,
} from "@/integrations/airtable/actions/addAttachment";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
  mockCreateSignedUrl.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "airtable",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-15T12:00:00Z",
    providerAccountId: "usrXXX",
    payload: {},
  };
}

function v2StorageRef(overrides?: Record<string, unknown>) {
  return {
    kind: "v2_storage" as const,
    name: "photo.png",
    mimeType: "image/png",
    storagePath: "user-1/wf-1/run-1/node-1/photo.png",
    ...overrides,
  };
}

function signedUrlRef(overrides?: Record<string, unknown>) {
  return {
    kind: "signed_url" as const,
    name: "doc.pdf",
    mimeType: "application/pdf",
    url: "https://signed.example/doc.pdf",
    ...overrides,
  };
}

function airtableRecordResponse(overrides?: Record<string, unknown>) {
  // What Airtable returns after PATCH: the record with the ingested
  // attachment, including its own URL + ids that Airtable mints.
  return {
    id: "rec123",
    fields: {
      Photo: [
        {
          id: "attMOCK_1",
          url: "https://airtable.example/cell/photo.png",
          filename: "photo.png",
          size: 1234,
          type: "image/png",
        },
      ],
    },
    createdTime: "2026-05-15T10:00:00Z",
    ...overrides,
  };
}

describe("add_attachment action — Airtable 2.1 Commit 2", () => {
  it("resolves v2_storage FileRef to a signed URL and PATCHes Airtable with the wire shape", async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({
      signedUrl: "https://signed.example/sec-abc",
      expiresAt: "2026-05-15T12:10:00Z",
    });
    mockUpdate.mockResolvedValueOnce(airtableRecordResponse());

    const result = await addAttachment({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "run-1",
      nodeId: "node-1",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tblTASKS",
        recordId: "rec123",
        fieldName: "Photo",
        file: v2StorageRef(),
      },
      triggerEvent: trigger(),
    });

    // Signed URL was minted from the v2_storage path.
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrl.mock.calls[0]![0]!).toEqual({
      storagePath: "user-1/wf-1/run-1/node-1/photo.png",
      reason: "airtable:add_attachment run=run-1 node=node-1",
    });

    // PATCH wire shape: [{url: signedUrl, filename: file.name}].
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.baseId).toBe("appBASE");
    expect(callArg.tableIdOrName).toBe("tblTASKS");
    expect(callArg.recordId).toBe("rec123");
    expect(callArg.fields).toEqual({
      Photo: [
        {
          url: "https://signed.example/sec-abc",
          filename: "photo.png",
        },
      ],
    });

    // Output: bounded projection from Airtable's response — Airtable's
    // own URL, NOT our signed URL.
    expect(result.output.baseId).toBe("appBASE");
    expect(result.output.tableIdOrName).toBe("tblTASKS");
    expect(result.output.recordId).toBe("rec123");
    expect(result.output.fieldName).toBe("Photo");
    expect(result.output.attachmentCount).toBe(1);
    expect(result.output.attachments).toEqual([
      {
        id: "attMOCK_1",
        url: "https://airtable.example/cell/photo.png",
        filename: "photo.png",
        size: 1234,
        type: "image/png",
      },
    ]);
  });

  it("uses signed_url FileRef directly — no signed-URL service call", async () => {
    mockUpdate.mockResolvedValueOnce(airtableRecordResponse());
    await addAttachment({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "run-1",
      nodeId: "node-1",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tblTASKS",
        recordId: "rec123",
        fieldName: "Photo",
        file: signedUrlRef(),
      },
      triggerEvent: trigger(),
    });
    // No signed URL service call — the caller already supplied a
    // fetchable URL.
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    // PATCH used the supplied URL verbatim.
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.fields.Photo).toEqual([
      { url: "https://signed.example/doc.pdf", filename: "doc.pdf" },
    ]);
  });

  it("rejects provider_url FileRef with structured AirtableAddAttachmentConfigError + unblock hint", async () => {
    const promise = addAttachment({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "run-1",
      nodeId: "node-1",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tblTASKS",
        recordId: "rec123",
        fieldName: "Photo",
        file: {
          kind: "provider_url",
          name: "f.png",
          mimeType: "image/png",
          url: "https://slack.example/files/F123",
          provider: "slack",
        },
      },
      triggerEvent: trigger(),
    });
    await expect(promise).rejects.toBeInstanceOf(
      AirtableAddAttachmentConfigError,
    );
    try {
      await promise;
    } catch (err) {
      const e = err as AirtableAddAttachmentConfigError;
      expect(e.code).toBe("provider_url_unsupported");
      expect(e.hint).toMatch(/Stage bytes first/i);
    }
    // No signed URL, no Airtable PATCH.
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("filename override replaces the FileRef's name in the wire payload", async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({
      signedUrl: "https://signed.example/sec-abc",
      expiresAt: "2026-05-15T12:10:00Z",
    });
    mockUpdate.mockResolvedValueOnce(airtableRecordResponse());
    await addAttachment({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "run-1",
      nodeId: "node-1",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tblTASKS",
        recordId: "rec123",
        fieldName: "Photo",
        file: v2StorageRef({ name: "internal-photo.png" }),
        filename: "renamed-by-workflow.png",
      },
      triggerEvent: trigger(),
    });
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.fields.Photo[0].filename).toBe("renamed-by-workflow.png");
  });

  it("does NOT issue a GET before PATCH (NPD-A5 — no GET-then-merge)", async () => {
    // The handler should only call recordsUpdate. Since recordsGet is
    // mocked separately and never wired into the handler path, the
    // absence of any recordsGet call is asserted implicitly by mock
    // accounting plus this explicit check.
    mockCreateSignedUrl.mockResolvedValueOnce({
      signedUrl: "https://signed.example/sec-abc",
      expiresAt: "2026-05-15T12:10:00Z",
    });
    mockUpdate.mockResolvedValueOnce(airtableRecordResponse());
    await addAttachment({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        recordId: "rec",
        fieldName: "Photo",
        file: v2StorageRef(),
      },
      triggerEvent: trigger(),
    });
    // refreshAndRetry called exactly once — only the PATCH. (If a
    // GET-then-merge slipped in, refreshAndRetry would fire twice.)
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("threads accountId from the trigger event", async () => {
    mockUpdate.mockResolvedValueOnce(airtableRecordResponse());
    await addAttachment({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        recordId: "rec",
        fieldName: "Photo",
        file: signedUrlRef(),
      },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.providerAccountId).toBe("usrXXX");
  });

  it("propagates signed URL creation failures (no Airtable PATCH issued)", async () => {
    mockCreateSignedUrl.mockRejectedValueOnce(
      new Error("workflow-files signed URL creation failed: bucket missing"),
    );
    await expect(
      addAttachment({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          recordId: "rec",
          fieldName: "Photo",
          file: v2StorageRef(),
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/signed URL creation failed/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("propagates Airtable PATCH errors", async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({
      signedUrl: "https://signed.example/sec-abc",
      expiresAt: "2026-05-15T12:10:00Z",
    });
    mockUpdate.mockRejectedValueOnce(new Error("not found: record rec"));
    await expect(
      addAttachment({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          recordId: "rec",
          fieldName: "Photo",
          file: v2StorageRef(),
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/not found/);
  });

  it("handles empty attachment field on response (defensive — Airtable hasn't ingested yet)", async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({
      signedUrl: "https://signed.example/sec-abc",
      expiresAt: "2026-05-15T12:10:00Z",
    });
    mockUpdate.mockResolvedValueOnce({
      id: "rec123",
      fields: {}, // Airtable response omits Photo entirely
    });
    const result = await addAttachment({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        recordId: "rec",
        fieldName: "Photo",
        file: v2StorageRef(),
      },
      triggerEvent: trigger(),
    });
    expect(result.output.attachmentCount).toBe(0);
    expect(result.output.attachments).toEqual([]);
  });

  it("output does NOT include bytes, base64, content, or signed URL (P-S3 invariant)", async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({
      signedUrl: "https://signed.example/secret-token",
      expiresAt: "2026-05-15T12:10:00Z",
    });
    mockUpdate.mockResolvedValueOnce(airtableRecordResponse());
    const result = await addAttachment({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        recordId: "rec",
        fieldName: "Photo",
        file: v2StorageRef(),
      },
      triggerEvent: trigger(),
    });
    const serialized = JSON.stringify(result.output);
    // No raw byte / base64 / content keys ever leak into output.
    expect(serialized).not.toMatch(/"bytes"\s*:/);
    expect(serialized).not.toMatch(/"base64"\s*:/);
    expect(serialized).not.toMatch(/"content"\s*:/);
    expect(serialized).not.toMatch(/"data"\s*:/);
    // Signed URL never appears in output — Airtable's response URL is
    // what surfaces.
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("signed.example");
  });

  it("output uses bounded 6-key projection (no raw Airtable response spread)", async () => {
    mockCreateSignedUrl.mockResolvedValueOnce({
      signedUrl: "https://signed.example/sec",
      expiresAt: "2026-05-15T12:10:00Z",
    });
    // Airtable response includes extras — id, url, filename, size,
    // type are projected; width / height / createdAt are not.
    mockUpdate.mockResolvedValueOnce({
      id: "rec123",
      fields: {
        Photo: [
          {
            id: "attXYZ",
            url: "https://airtable.example/u",
            filename: "p.png",
            size: 999,
            type: "image/png",
            width: 1024,
            height: 768,
            extra: "leak?",
          },
        ],
      },
      createdTime: "2026-05-15T10:00:00Z",
    });
    const result = await addAttachment({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        recordId: "rec",
        fieldName: "Photo",
        file: v2StorageRef(),
      },
      triggerEvent: trigger(),
    });
    const attachments = result.output.attachments as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(attachments[0]).toEqual({
      id: "attXYZ",
      url: "https://airtable.example/u",
      filename: "p.png",
      size: 999,
      type: "image/png",
    });
    // Extras intentionally NOT in projection.
    expect(attachments[0]!).not.toHaveProperty("width");
    expect(attachments[0]!).not.toHaveProperty("height");
    expect(attachments[0]!).not.toHaveProperty("extra");
  });
});
