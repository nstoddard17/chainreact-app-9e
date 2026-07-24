/**
 * @jest-environment node
 *
 * AI-PROVIDER-7 (CS-7) — POST /api/workflows/[id]/ai/suggest-schema.
 *
 * The gate ORDER is the contract: nothing reads workflow data or spends a
 * credit before its guard passes, the sample is resolved server-side from
 * state we already own, and run outputs are only ever read from a TEST run
 * the caller started.
 */
const mockRequireUser = jest.fn();
const mockLoadWorkflowForMember = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => {
  const actual = jest.requireActual("@/app/api/workflows/_shared");
  return {
    ...actual,
    requireUser: (...args: unknown[]) => mockRequireUser(...args),
    loadWorkflowForMember: (...args: unknown[]) => mockLoadWorkflowForMember(...args),
  };
});

const mockIsAccountFrozen = jest.fn();
jest.mock("@/services/accounts/accountFreeze", () => ({
  ...jest.requireActual("@/services/accounts/accountFreeze"),
  isAccountFrozen: (...args: unknown[]) => mockIsAccountFrozen(...args),
}));

const mockListByWorkflow = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  listByWorkflow: (...args: unknown[]) => mockListByWorkflow(...args),
}));

const mockRunSchemaSuggestion = jest.fn();
jest.mock("@/services/ai/processor/runSchemaSuggestion", () => ({
  runSchemaSuggestion: (...args: unknown[]) => mockRunSchemaSuggestion(...args),
}));

import { NextResponse } from "next/server";
import { POST } from "@/app/api/workflows/[id]/ai/suggest-schema/route";
import { AI_PROCESSOR_ENV } from "@/services/ai/processor/config";
import {
  AiActionRefusedError,
  AiCreditsExhaustedError,
  DocumentInputError,
} from "@/services/ai/processor/analysisErrors";

const FILE_REF = {
  kind: "v2_storage",
  name: "payroll.pdf",
  mimeType: "application/pdf",
  storagePath: "u/w/r/n/payroll.pdf",
};

const PROPOSAL = {
  schema: { fields: [{ name: "employee_name", type: "string" }] },
  sourceName: "payroll.pdf",
  truncated: false,
};

function workflowRecord(config: Record<string, unknown>) {
  return {
    ok: true,
    record: {
      id: "wf-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      draftDefinition: {
        nodes: [
          { id: "t1", kind: "trigger", provider: "native", type: "manual", config: {} },
          { id: "node-1", kind: "action", provider: "ai", type: "analyze_document", config },
        ],
        edges: [],
      },
    },
  };
}

function post(body: unknown, workflowId = "wf-1"): Promise<Response> {
  return POST(
    new Request("http://localhost/api/workflows/wf-1/ai/suggest-schema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: workflowId }) },
  );
}

const VALID_BODY = { nodeId: "node-1", sampleSourceField: "file" };

const originalFlag = process.env[AI_PROCESSOR_ENV.enabled];
beforeAll(() => {
  process.env[AI_PROCESSOR_ENV.enabled] = "true";
});
afterAll(() => {
  if (originalFlag === undefined) delete process.env[AI_PROCESSOR_ENV.enabled];
  else process.env[AI_PROCESSOR_ENV.enabled] = originalFlag;
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env[AI_PROCESSOR_ENV.enabled] = "true";
  mockRequireUser.mockResolvedValue({ ok: true, userId: "user-1" });
  mockLoadWorkflowForMember.mockResolvedValue(workflowRecord({ file: FILE_REF }));
  mockIsAccountFrozen.mockResolvedValue(false);
  mockListByWorkflow.mockResolvedValue([]);
  mockRunSchemaSuggestion.mockResolvedValue(PROPOSAL);
});

describe("gates", () => {
  it("401s before touching the workflow", async () => {
    mockRequireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(401);
    expect(mockLoadWorkflowForMember).not.toHaveBeenCalled();
    expect(mockRunSchemaSuggestion).not.toHaveBeenCalled();
  });

  it("400s on an unknown body key (a client-supplied accountId is refused)", async () => {
    const res = await post({ ...VALID_BODY, accountId: "acct-evil" });
    expect(res.status).toBe(400);
    expect(mockLoadWorkflowForMember).not.toHaveBeenCalled();
  });

  it("400s when the required body fields are missing", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ nodeId: "node-1" })).status).toBe(400);
  });

  it("503s when the processor is disabled — before ANY workflow read", async () => {
    process.env[AI_PROCESSOR_ENV.enabled] = "false";
    const res = await post(VALID_BODY);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: "SUGGESTIONS_UNAVAILABLE",
    });
    expect(mockLoadWorkflowForMember).not.toHaveBeenCalled();
  });

  it("passes the no-leak 404 straight through for a non-member", async () => {
    mockLoadWorkflowForMember.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Workflow not found." }, { status: 404 }),
    });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(404);
    expect(mockRunSchemaSuggestion).not.toHaveBeenCalled();
  });

  it("403s a frozen account before spending anything", async () => {
    mockIsAccountFrozen.mockResolvedValue(true);
    const res = await post(VALID_BODY);
    expect(res.status).toBe(403);
    expect(mockRunSchemaSuggestion).not.toHaveBeenCalled();
  });

  it("404s a node that is no longer in the saved workflow", async () => {
    const res = await post({ ...VALID_BODY, nodeId: "ghost" });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: "NODE_NOT_FOUND" });
    expect(mockRunSchemaSuggestion).not.toHaveBeenCalled();
  });
});

describe("sample resolution", () => {
  it("uses a FileRef saved in the node's own config, with no run at all", async () => {
    const res = await post(VALID_BODY);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      schema: PROPOSAL.schema,
      sourceName: "payroll.pdf",
      sampleSource: "config_literal",
    });
    expect(mockRunSchemaSuggestion.mock.calls[0][0]).toMatchObject({
      sample: FILE_REF,
      accountId: "acct-1",
      userId: "user-1",
      workflowId: "wf-1",
    });
  });

  it("resolves a token against the caller's OWN test run", async () => {
    mockLoadWorkflowForMember.mockResolvedValue(
      workflowRecord({ file: "{{t1.attachment}}" }),
    );
    mockListByWorkflow.mockResolvedValue([
      {
        isTest: true,
        triggeredByUserId: "user-1",
        triggerNodeId: "t1",
        steps: [{ nodeId: "t1", status: "succeeded", output: { attachment: FILE_REF } }],
      },
    ]);
    const res = await post(VALID_BODY);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ sampleSource: "latest_run" });
    expect(mockRunSchemaSuggestion.mock.calls[0][0]).toMatchObject({ sample: FILE_REF });
  });

  it("NEVER reads a co-member's run, or a real (non-test) run", async () => {
    mockLoadWorkflowForMember.mockResolvedValue(
      workflowRecord({ file: "{{t1.attachment}}" }),
    );
    mockListByWorkflow.mockResolvedValue([
      // someone else's test run
      {
        isTest: true,
        triggeredByUserId: "user-2",
        triggerNodeId: "t1",
        steps: [{ nodeId: "t1", status: "succeeded", output: { attachment: FILE_REF } }],
      },
      // the caller's REAL run
      {
        isTest: false,
        triggeredByUserId: "user-1",
        triggerNodeId: "t1",
        steps: [{ nodeId: "t1", status: "succeeded", output: { attachment: FILE_REF } }],
      },
    ]);
    const res = await post(VALID_BODY);
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ code: "NO_SAMPLE" });
    expect(mockRunSchemaSuggestion).not.toHaveBeenCalled();
  });

  it("422s with actionable copy when there is nothing to sample yet", async () => {
    mockLoadWorkflowForMember.mockResolvedValue(workflowRecord({}));
    const res = await post(VALID_BODY);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("NO_SAMPLE");
    expect(body.message).toMatch(/Pick the document or data/);
    expect(mockRunSchemaSuggestion).not.toHaveBeenCalled();
  });

  it("degrades to 'no sample' rather than an error when run history is unreadable", async () => {
    mockLoadWorkflowForMember.mockResolvedValue(
      workflowRecord({ file: "{{t1.attachment}}" }),
    );
    mockListByWorkflow.mockRejectedValue(new Error("db down"));
    const res = await post(VALID_BODY);
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ code: "NO_SAMPLE" });
  });
});

describe("failure mapping", () => {
  it("402s when the account is out of AI credits", async () => {
    mockRunSchemaSuggestion.mockRejectedValue(
      new AiCreditsExhaustedError("Not enough AI credits for this step."),
    );
    const res = await post(VALID_BODY);
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({ code: "AI_CREDITS_EXHAUSTED" });
  });

  it("422s an unreadable document with the pipeline's own remedy", async () => {
    mockRunSchemaSuggestion.mockRejectedValue(
      new DocumentInputError(
        "No readable text found - scanned or image-only documents aren't supported yet.",
      ),
    );
    const res = await post(VALID_BODY);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("SAMPLE_UNREADABLE");
    expect(body.message).toMatch(/scanned or image-only/);
  });

  it("503s any other refusal", async () => {
    mockRunSchemaSuggestion.mockRejectedValue(
      new AiActionRefusedError("disabled", "This AI capability is not enabled."),
    );
    const res = await post(VALID_BODY);
    expect(res.status).toBe(503);
  });

  it("503s an unexpected failure with safe copy — never the raw error", async () => {
    mockRunSchemaSuggestion.mockRejectedValue(
      new Error("gateway said: {\"token\":\"secret-abc\"}"),
    );
    const res = await post(VALID_BODY);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { message: string };
    expect(body.message).not.toMatch(/secret-abc|token|gateway/);
  });
});

describe("no-leak", () => {
  it("returns only the proposal + safe flags", async () => {
    const res = await post(VALID_BODY);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "ok",
      "sampleSource",
      "schema",
      "sourceName",
      "truncated",
    ]);
  });

  it("never echoes the document text or the account id", async () => {
    mockRunSchemaSuggestion.mockResolvedValue({
      ...PROPOSAL,
      sourceName: "payroll.pdf",
    });
    const res = await post(VALID_BODY);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("acct-1");
    expect(raw).not.toContain("u/w/r/n/payroll.pdf");
  });
});
