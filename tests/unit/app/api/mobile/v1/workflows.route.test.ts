/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET as listGet } from "@/app/api/mobile/v1/accounts/[accountId]/workflows/route";
import { GET as detailGet } from "@/app/api/mobile/v1/accounts/[accountId]/workflows/[workflowId]/route";

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
  listPageByAccountServiceRole: jest.fn(),
  listNamesByIdsForAccountServiceRole: jest.fn(),
}));
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: jest.fn(),
}));
jest.mock("@/repositories/workflowRunStats", () => ({
  getStatsForAccount: jest.fn().mockResolvedValue(new Map()),
}));

import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import { listByIdsServiceRole } from "@/repositories/accounts";
import { listPageByAccountServiceRole } from "@/repositories/mobile/workflows";
import { getByIdServiceRole } from "@/repositories/workflows";

const getUserMock = jest.fn();
(getServiceRoleClient as jest.Mock).mockReturnValue({ auth: { getUser: getUserMock } });

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT = "00000000-0000-4000-8000-0000000000a2";
const WF = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;

const HOSTILE_CONFIG = {
  channel: "SECRET-CHANNEL-ID",
  apiToken: "SECRET-CONFIG-API-KEY",
  recipient: "secret-person@example.test",
};

function workflowRecord(n: number, updatedAt: string) {
  return {
    id: WF(n),
    accountId: ACCOUNT,
    createdByUserId: USER_ID,
    name: `Workflow ${n}`,
    state: "active",
    disabledReason: null,
    disabledContext: "SECRET-OPS-CONTEXT provider said: token xyz expired",
    activeRevisionId: null,
    draftDefinition: {
      nodes: [
        {
          id: "node-1",
          kind: "trigger",
          provider: "slack",
          type: "new_message",
          config: HOSTILE_CONFIG,
          displayName: "Watch channel",
        },
        {
          id: "node-2",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
          config: HOSTILE_CONFIG,
        },
      ],
      edges: [{ id: "e1", from: "node-1", to: "node-2" }],
    },
    deletedAt: null,
    folderId: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt,
  };
}

function memberOk() {
  (getRoleServiceRole as jest.Mock).mockResolvedValue("member");
  (listByIdsServiceRole as jest.Mock).mockResolvedValue([
    { id: ACCOUNT, name: "Example Team", type: "team", deletionStatus: "active" },
  ]);
}

function listReq(query = ""): [NextRequest, { params: Promise<{ accountId: string }> }] {
  return [
    new NextRequest(`http://localhost/api/mobile/v1/accounts/${ACCOUNT}/workflows${query}`, {
      headers: { authorization: "Bearer valid-user-jwt" },
    }),
    { params: Promise.resolve({ accountId: ACCOUNT }) },
  ];
}

beforeEach(() => {
  process.env.ENABLE_MOBILE_API = "true";
  jest.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID, email: null } }, error: null });
});
afterAll(() => delete process.env.ENABLE_MOBILE_API);

describe("GET /accounts/{accountId}/workflows — mobile list", () => {
  it("returns summaries; the graph, node config, and raw disabled context NEVER serialize", async () => {
    memberOk();
    (listPageByAccountServiceRole as jest.Mock).mockResolvedValue([
      workflowRecord(1, "2026-07-30T10:00:00.000Z"),
    ]);
    const res = await listGet(...listReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0]).toMatchObject({
      id: WF(1),
      name: "Workflow 1",
      state: "active",
      triggerCount: 1,
      actionCount: 1,
    });
    const text = JSON.stringify(body);
    for (const marker of [
      "SECRET-CHANNEL-ID",
      "SECRET-CONFIG-API-KEY",
      "secret-person@example.test",
      "SECRET-OPS-CONTEXT",
      "draftDefinition",
      "edges",
      "config",
      "disabledContext",
    ]) {
      expect(text).not.toContain(marker);
    }
  });

  it("paginates by cursor: full first page + nextCursor, then the final short page", async () => {
    memberOk();
    // limit=1 → repo asked for 2; return 2 to signal more.
    (listPageByAccountServiceRole as jest.Mock).mockResolvedValueOnce([
      workflowRecord(1, "2026-07-30T10:00:00.000Z"),
      workflowRecord(2, "2026-07-29T10:00:00.000Z"),
    ]);
    const first = await listGet(...listReq("?limit=1"));
    const firstBody = await first.json();
    expect(firstBody.workflows.map((w: { id: string }) => w.id)).toEqual([WF(1)]);
    expect(firstBody.pageInfo.hasMore).toBe(true);
    expect(typeof firstBody.pageInfo.nextCursor).toBe("string");

    (listPageByAccountServiceRole as jest.Mock).mockResolvedValueOnce([
      workflowRecord(2, "2026-07-29T10:00:00.000Z"),
    ]);
    const second = await listGet(
      ...listReq(`?limit=1&cursor=${encodeURIComponent(firstBody.pageInfo.nextCursor)}`),
    );
    const secondBody = await second.json();
    expect(secondBody.workflows.map((w: { id: string }) => w.id)).toEqual([WF(2)]);
    expect(secondBody.pageInfo).toEqual({ nextCursor: null, hasMore: false });
    // The decoded keyset position reached the repository.
    const secondCall = (listPageByAccountServiceRole as jest.Mock).mock.calls[1][1];
    expect(secondCall.before).toEqual({
      sortTs: "2026-07-30T10:00:00.000Z",
      id: WF(1),
    });
  });

  it("invalid cursor → stable 400 INVALID_CURSOR", async () => {
    memberOk();
    const res = await listGet(...listReq("?cursor=%21%21garbage%21%21"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid cursor.", code: "INVALID_CURSOR" });
  });

  it("unknown state filter → 400; valid filter reaches the repository", async () => {
    memberOk();
    const bad = await listGet(...listReq("?state=exploded"));
    expect(bad.status).toBe(400);

    (listPageByAccountServiceRole as jest.Mock).mockResolvedValue([]);
    const ok = await listGet(...listReq("?state=paused"));
    expect(ok.status).toBe(200);
    expect((listPageByAccountServiceRole as jest.Mock).mock.calls.at(-1)[1].state).toBe("paused");
  });

  it("non-member and nonexistent account are the same no-leak 404", async () => {
    (getRoleServiceRole as jest.Mock).mockResolvedValue(null);
    (listByIdsServiceRole as jest.Mock).mockResolvedValue([]);
    const res = await listGet(...listReq());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found.", code: "NOT_FOUND" });
    expect(listPageByAccountServiceRole).not.toHaveBeenCalled();
  });

  it("frozen account → 403 ACCOUNT_PENDING_DELETION", async () => {
    (getRoleServiceRole as jest.Mock).mockResolvedValue("owner");
    (listByIdsServiceRole as jest.Mock).mockResolvedValue([
      { id: ACCOUNT, name: "T", type: "team", deletionStatus: "pending_deletion" },
    ]);
    const res = await listGet(...listReq());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });
});

describe("GET /accounts/{accountId}/workflows/{workflowId} — light detail", () => {
  function detailReq(workflowId: string) {
    return [
      new NextRequest(
        `http://localhost/api/mobile/v1/accounts/${ACCOUNT}/workflows/${workflowId}`,
        { headers: { authorization: "Bearer valid-user-jwt" } },
      ),
      { params: Promise.resolve({ accountId: ACCOUNT, workflowId }) },
    ] as const;
  }

  it("returns node LABELS for step naming — never config, edges, or the graph", async () => {
    memberOk();
    (getByIdServiceRole as jest.Mock).mockResolvedValue(workflowRecord(1, "2026-07-30T10:00:00.000Z"));
    const res = await detailGet(...detailReq(WF(1)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toEqual([
      {
        nodeId: "node-1",
        kind: "trigger",
        capability: "slack:new_message",
        provider: "slack",
        displayName: "Watch channel",
      },
      {
        nodeId: "node-2",
        kind: "action",
        capability: "slack:send_channel_message",
        provider: "slack",
        displayName: null,
      },
    ]);
    const text = JSON.stringify(body);
    for (const marker of ["SECRET-CHANNEL-ID", "SECRET-CONFIG-API-KEY", "edges", "config", "draftDefinition"]) {
      expect(text).not.toContain(marker);
    }
  });

  it("cross-account workflow → 404 indistinguishable from missing", async () => {
    memberOk();
    (getByIdServiceRole as jest.Mock).mockResolvedValue({
      ...workflowRecord(1, "2026-07-30T10:00:00.000Z"),
      accountId: "00000000-0000-4000-8000-00000000ffff",
    });
    const crossAccount = await detailGet(...detailReq(WF(1)));
    (getByIdServiceRole as jest.Mock).mockResolvedValue(null);
    const missing = await detailGet(...detailReq(WF(9)));
    expect(crossAccount.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await crossAccount.json()).toEqual(await missing.json());
  });
});
