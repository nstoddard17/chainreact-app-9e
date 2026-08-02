/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET as accountRunsGet } from "@/app/api/mobile/v1/accounts/[accountId]/runs/route";
import { GET as workflowRunsGet } from "@/app/api/mobile/v1/accounts/[accountId]/workflows/[workflowId]/runs/route";
import { GET as runDetailGet } from "@/app/api/mobile/v1/accounts/[accountId]/workflows/[workflowId]/runs/[runId]/route";

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(),
}));
jest.mock("@/repositories/mcpRateLimits", () => ({
  incrementMcpRateLimitWindowsServiceRole: jest.fn().mockResolvedValue({ token: 1, account: 1 }),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: jest.fn(),
}));
jest.mock("@/repositories/accounts", () => ({
  listByIdsServiceRole: jest.fn(),
}));
jest.mock("@/repositories/mobile/workflows", () => ({
  listNamesByIdsForAccountServiceRole: jest.fn(),
  listPageByAccountServiceRole: jest.fn(),
}));
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: jest.fn(),
}));
jest.mock("@/repositories/mobile/workflowRuns", () => ({
  listPageByAccountForMobileServiceRole: jest.fn(),
  getRunForMobileDetailServiceRole: jest.fn(),
}));

import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import { listByIdsServiceRole } from "@/repositories/accounts";
import {
  listNamesByIdsForAccountServiceRole,
} from "@/repositories/mobile/workflows";
import { getByIdServiceRole } from "@/repositories/workflows";
import {
  listPageByAccountForMobileServiceRole,
  getRunForMobileDetailServiceRole,
} from "@/repositories/mobile/workflowRuns";

const getUserMock = jest.fn();
(getServiceRoleClient as jest.Mock).mockReturnValue({ auth: { getUser: getUserMock } });

const USER_ID = "00000000-0000-4000-8000-000000000001";
const TEAM = "00000000-0000-4000-8000-0000000000a2";
const WF = "00000000-0000-4000-8000-0000000000b1";
const RUN = (n: number) => `00000000-0000-4000-8000-0000000000c${n}`;

function memberOk() {
  (getRoleServiceRole as jest.Mock).mockResolvedValue("member");
  (listByIdsServiceRole as jest.Mock).mockResolvedValue([
    { id: TEAM, name: "Example Team", type: "team", deletionStatus: "active" },
  ]);
}

function workflowOk() {
  (getByIdServiceRole as jest.Mock).mockResolvedValue({
    id: WF,
    accountId: TEAM,
    name: "Example lead follow-up",
    state: "active",
    draftDefinition: {
      nodes: [
        { id: "node-1", kind: "trigger", provider: "slack", type: "new_message", config: {}, displayName: "Watch channel" },
        { id: "node-2", kind: "action", provider: "slack", type: "send_channel_message", config: {} },
      ],
      edges: [],
    },
  });
}

function runRecord(n: number, status: string, extra: Record<string, unknown> = {}) {
  return {
    id: RUN(n),
    workflowId: WF,
    status,
    isTest: false,
    triggeredBy: "webhook",
    startedAt: `2026-07-31T10:0${n}:00.000Z`,
    finishedAt: null,
    errorClassification: null,
    ...extra,
  };
}

const authHeaders = { authorization: "Bearer valid-user-jwt" };

beforeEach(() => {
  process.env.ENABLE_MOBILE_API = "true";
  jest.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID, email: null } }, error: null });
  (listNamesByIdsForAccountServiceRole as jest.Mock).mockResolvedValue(
    new Map([[WF, "Example lead follow-up"]]),
  );
});
afterAll(() => delete process.env.ENABLE_MOBILE_API);

describe("GET /accounts/{accountId}/runs — explicit-account feed", () => {
  function reqFor(accountId: string, query = "") {
    return [
      new NextRequest(`http://localhost/api/mobile/v1/accounts/${accountId}/runs${query}`, {
        headers: authHeaders,
      }),
      { params: Promise.resolve({ accountId }) },
    ] as const;
  }

  it("honors the EXPLICIT team account (never personal-pinned) and includes queued+running", async () => {
    memberOk();
    (listPageByAccountForMobileServiceRole as jest.Mock).mockResolvedValue([
      runRecord(1, "queued"),
      runRecord(2, "running"),
      runRecord(3, "succeeded", { finishedAt: "2026-07-31T10:03:04.000Z" }),
    ]);
    const res = await accountRunsGet(...reqFor(TEAM));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs.map((r: { status: string }) => r.status)).toEqual([
      "queued",
      "running",
      "succeeded",
    ]);
    // The repository was scoped to the URL's account — the caller's choice.
    expect((listPageByAccountForMobileServiceRole as jest.Mock).mock.calls[0][0]).toBe(TEAM);
    // durationMs computed only for the finished run.
    expect(body.runs[0].durationMs).toBeNull();
    expect(body.runs[2].durationMs).toBe(4000);
  });

  it("invalid status filter → 400; valid one reaches the repository", async () => {
    memberOk();
    const bad = await accountRunsGet(...reqFor(TEAM, "?status=exploded"));
    expect(bad.status).toBe(400);
    (listPageByAccountForMobileServiceRole as jest.Mock).mockResolvedValue([]);
    const ok = await accountRunsGet(...reqFor(TEAM, "?status=failed"));
    expect(ok.status).toBe(200);
    expect(
      (listPageByAccountForMobileServiceRole as jest.Mock).mock.calls.at(-1)[1].status,
    ).toBe("failed");
  });

  it("non-member account → no-leak 404 before any run read", async () => {
    (getRoleServiceRole as jest.Mock).mockResolvedValue(null);
    (listByIdsServiceRole as jest.Mock).mockResolvedValue([]);
    const res = await accountRunsGet(...reqFor(TEAM));
    expect(res.status).toBe(404);
    expect(listPageByAccountForMobileServiceRole).not.toHaveBeenCalled();
  });
});

describe("GET .../workflows/{workflowId}/runs — per-workflow isolation", () => {
  function reqFor(workflowId: string) {
    return [
      new NextRequest(
        `http://localhost/api/mobile/v1/accounts/${TEAM}/workflows/${workflowId}/runs`,
        { headers: authHeaders },
      ),
      { params: Promise.resolve({ accountId: TEAM, workflowId }) },
    ] as const;
  }

  it("verifies the workflow belongs to the account, then scopes the read to it", async () => {
    memberOk();
    workflowOk();
    (listPageByAccountForMobileServiceRole as jest.Mock).mockResolvedValue([
      runRecord(2, "running"),
    ]);
    const res = await workflowRunsGet(...reqFor(WF));
    expect(res.status).toBe(200);
    expect(
      (listPageByAccountForMobileServiceRole as jest.Mock).mock.calls[0][1].workflowId,
    ).toBe(WF);
  });

  it("a workflow in ANOTHER account → 404, no run read", async () => {
    memberOk();
    (getByIdServiceRole as jest.Mock).mockResolvedValue({
      id: WF,
      accountId: "00000000-0000-4000-8000-00000000ffff",
      name: "Foreign",
      state: "active",
      draftDefinition: { nodes: [], edges: [] },
    });
    const res = await workflowRunsGet(...reqFor(WF));
    expect(res.status).toBe(404);
    expect(listPageByAccountForMobileServiceRole).not.toHaveBeenCalled();
  });
});

describe("GET .../runs/{runId} — redacted ANY-status detail", () => {
  function reqFor(runId: string) {
    return [
      new NextRequest(
        `http://localhost/api/mobile/v1/accounts/${TEAM}/workflows/${WF}/runs/${runId}`,
        { headers: authHeaders },
      ),
      { params: Promise.resolve({ accountId: TEAM, workflowId: WF, runId }) },
    ] as const;
  }

  it("a QUEUED run is fetchable immediately (the signature-journey fix)", async () => {
    memberOk();
    workflowOk();
    (getRunForMobileDetailServiceRole as jest.Mock).mockResolvedValue({
      ...runRecord(1, "queued"),
      accountId: TEAM,
      steps: [],
    });
    const res = await runDetailGet(...reqFor(RUN(1)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("queued");
    expect(body.steps).toEqual([]);
    expect(body.finishedAt).toBeNull();
  });

  it("a RUNNING run is fetchable", async () => {
    memberOk();
    workflowOk();
    (getRunForMobileDetailServiceRole as jest.Mock).mockResolvedValue({
      ...runRecord(2, "running"),
      accountId: TEAM,
      steps: [],
    });
    const res = await runDetailGet(...reqFor(RUN(2)));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("running");
  });

  it("a FAILED run carries the humanized explanation + labeled sanitized steps — nothing else", async () => {
    memberOk();
    workflowOk();
    (getRunForMobileDetailServiceRole as jest.Mock).mockResolvedValue({
      ...runRecord(3, "failed", {
        finishedAt: "2026-07-31T10:03:04.000Z",
        errorClassification: {
          title: "Example Chat connection needs attention",
          description: "ChainReact could no longer authenticate.",
          action: "reconnect",
          severity: "error",
        },
      }),
      accountId: TEAM,
      steps: [
        { nodeId: "node-1", status: "succeeded", error: null },
        {
          nodeId: "node-2",
          status: "failed",
          error: { code: "INTEGRATION_REAUTH_REQUIRED", message: "The connection needs to be reconnected." },
        },
      ],
    });
    const res = await runDetailGet(...reqFor(RUN(3)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errorClassification.action).toBe("reconnect");
    // Step labels resolved server-side from the workflow's nodes.
    expect(body.steps[0].displayName).toBe("Watch channel");
    expect(body.steps[1].displayName).toBe("Send channel message");
    expect(body.steps[1].error.code).toBe("INTEGRATION_REAUTH_REQUIRED");
    expect(Object.keys(body).sort()).toEqual([
      "durationMs",
      "errorClassification",
      "finishedAt",
      "id",
      "isTest",
      "startedAt",
      "status",
      "steps",
      "triggeredBy",
      "workflowId",
      "workflowName",
    ]);
  });

  it("cross-account run and missing run collapse to the same 404", async () => {
    memberOk();
    workflowOk();
    (getRunForMobileDetailServiceRole as jest.Mock).mockResolvedValue({
      ...runRecord(4, "failed"),
      accountId: "00000000-0000-4000-8000-00000000ffff",
      steps: [],
    });
    const cross = await runDetailGet(...reqFor(RUN(4)));
    (getRunForMobileDetailServiceRole as jest.Mock).mockResolvedValue(null);
    const missing = await runDetailGet(...reqFor(RUN(5)));
    expect(cross.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await cross.json()).toEqual(await missing.json());
  });

  it("LAYER 1 — the allow-list mapper drops hostile repo fields; the response carries none of them", async () => {
    memberOk();
    workflowOk();
    // Simulate a hypothetically-compromised repo layer returning raw data.
    (getRunForMobileDetailServiceRole as jest.Mock).mockResolvedValue({
      ...runRecord(6, "failed"),
      accountId: TEAM,
      steps: [
        {
          nodeId: "node-2",
          status: "failed",
          error: { code: "HANDLER_FAILED", message: "failed" },
          output: { rows: ["SECRET-STEP-OUTPUT"] },
        },
      ],
      triggerEvent: { payload: "SECRET-PROVIDER-PAYLOAD" },
      fatalError: { code: "X", message: "SECRET-FATAL" },
    });
    const res = await runDetailGet(...reqFor(RUN(6)));
    expect(res.status).toBe(200);
    const body = await res.json();
    const text = JSON.stringify(body);
    for (const marker of [
      "SECRET-STEP-OUTPUT",
      "SECRET-PROVIDER-PAYLOAD",
      "SECRET-FATAL",
      "output",
      "triggerEvent",
      "fatalError",
    ]) {
      expect(text).not.toContain(marker);
    }
  });

  it("LAYER 2 — a payload that somehow bypasses the mapper is strictly rejected at egress: safe 500, redacted diagnostic", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendMobileJson } = await import("@/app/api/mobile/v1/_shared");
    const { MobileRunDetailSchema } = await import("@chainreact/mobile-contracts");
    const hostile = {
      ...runRecord(7, "failed"),
      workflowName: "Example",
      durationMs: null,
      steps: [
        {
          nodeId: "node-2",
          displayName: null,
          status: "failed",
          error: { code: "HANDLER_FAILED", message: "failed" },
          output: { rows: ["SECRET-STEP-OUTPUT"] },
        },
      ],
      triggerEvent: { payload: "SECRET-PROVIDER-PAYLOAD" },
    };
    const res = sendMobileJson(
      MobileRunDetailSchema,
      hostile as never,
    );
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("SECRET-STEP-OUTPUT");
    expect(text).not.toContain("SECRET-PROVIDER-PAYLOAD");
    // The redacted diagnostic names issue PATHS only — never values.
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("SECRET-STEP-OUTPUT");
    expect(logged).not.toContain("SECRET-PROVIDER-PAYLOAD");
    spy.mockRestore();
  });
});
