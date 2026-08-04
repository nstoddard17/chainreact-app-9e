/**
 * @jest-environment node
 *
 * asana/triggers trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockUpsert = jest.fn();
const mockFind = jest.fn();
const mockRefreshAndRetry = jest.fn();
const mockWebhooksCreate = jest.fn();
const mockWebhooksDelete = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockTasksGet = jest.fn();
const mockStoriesGet = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  upsert: (...args: unknown[]) => mockUpsert(...args),
  findByWorkflowAndNode: (...args: unknown[]) => mockFind(...args),
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/services/oauth/refreshAndRetry", () => {
  class Unauthorized401Error extends Error {}
  class InsufficientScopeError extends Error {}
  class IntegrationActionRequiredError extends Error {}
  return {
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
    Unauthorized401Error,
    InsufficientScopeError,
    IntegrationActionRequiredError,
  };
});

jest.mock("@/integrations/_shared/asana/api/webhooks", () => ({
  webhooksCreate: (...args: unknown[]) => mockWebhooksCreate(...args),
  webhooksDelete: (...args: unknown[]) => mockWebhooksDelete(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => {
    if (!s.startsWith("enc(") || !s.endsWith(")")) throw new Error("bad ciphertext");
    return s.slice(4, -1);
  },
}));

jest.mock("@/integrations/_shared/asana/api/tasks", () => ({
  tasksGet: (...args: unknown[]) => mockTasksGet(...args),
}));

jest.mock("@/integrations/_shared/asana/api/stories", () => ({
  storiesGet: (...args: unknown[]) => mockStoriesGet(...args),
}));

import { buildAsanaActivate } from "@/integrations/asana/triggers/_shared/activate";
import { IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/asana/errors";
import { asanaSharedDeactivate } from "@/integrations/asana/triggers/_shared/deactivate";
import { normalizeNewTaskInProject } from "@/integrations/asana/triggers/newTaskInProject/normalize";
import { normalizeTaskUpdatedInProject } from "@/integrations/asana/triggers/taskUpdatedInProject/normalize";
import { normalizeTaskCompleted } from "@/integrations/asana/triggers/taskCompleted/normalize";
import { normalizeTaskAssigned } from "@/integrations/asana/triggers/taskAssigned/normalize";
import { normalizeCommentAddedToTask, COMMENT_TEXT_MAX } from "@/integrations/asana/triggers/commentAddedToTask/normalize";
import { asanaNewTaskInProjectFilter } from "@/integrations/asana/triggers/newTaskInProject/filter";
import { asanaTaskUpdatedInProjectFilter } from "@/integrations/asana/triggers/taskUpdatedInProject/filter";
import { asanaTaskCompletedFilter } from "@/integrations/asana/triggers/taskCompleted/filter";
import { asanaTaskAssignedFilter } from "@/integrations/asana/triggers/taskAssigned/filter";
import { asanaCommentAddedToTaskFilter } from "@/integrations/asana/triggers/commentAddedToTask/filter";
import { eventMatchesTriggerType } from "@/integrations/asana/triggers/_shared/eventMap";
import type { AsanaTask } from "@/integrations/_shared/asana/api/tasks";
import type { AsanaStoryDetail } from "@/integrations/_shared/asana/api/stories";
import { createHmac } from "node:crypto";
import { receiveAsanaWebhook } from "@/integrations/asana/triggers/_shared/receive";
import { InvalidSignatureError } from "@/core/triggers/errors";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Tests for the shared Asana activation builder — Slice 5.ASANA-1.
// The Asana-specific lifecycle: pre-upsert (handshakePending) →
// POST /webhooks (handshake persists the secret mid-call, simulated here
// via the mocked row read-back) → secret read-back → full config patch.
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "asana",
    providerAccountId: "marcus@example.test",
    displayName: "Marcus",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: "enc-r",
    accessTokenExpiresAt: null,
    scopes: [],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as never;
}

function node(config: Record<string, unknown>) {
  return { id: "node-1", kind: "trigger", provider: "asana", type: "new_task_in_project", config } as never;
}

beforeEach(() => {
  mockUpsert.mockReset();
  mockFind.mockReset();
  mockRefreshAndRetry.mockReset();
  mockWebhooksCreate.mockReset();
  mockWebhooksDelete.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  // Default: refreshAndRetry threads a token into the apiCall.
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.ASANA_WEBHOOK_URL;
});

const activate = buildAsanaActivate("new_task_in_project");

describe("buildAsanaActivate — happy path", () => {
  it("pre-upserts the pending row, creates the webhook with filters, and returns the full patch", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-1", active: true });
    mockFind.mockResolvedValueOnce({
      id: "tr-1",
      config: { hookSecretEncrypted: "enc(secret-1)" },
    });

    const patch = await activate({
      node: node({ projectId: "p-1", workspaceId: "w-1" }),
      integration: integration(),
      workflowId: "wf-1",
    });

    // 1. Pre-upsert happened BEFORE webhook creation, with the pending marker.
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockUpsert.mock.calls[0]![0];
    expect(upsertArg).toMatchObject({
      workflowId: "wf-1",
      userId: "user-1",
      provider: "asana",
      eventType: "new_task_in_project",
      nodeId: "node-1",
    });
    expect(upsertArg.config).toMatchObject({
      projectId: "p-1",
      handshakePending: true,
      webhookEnabled: false,
    });
    expect(mockUpsert.mock.invocationCallOrder[0]!).toBeLessThan(
      mockWebhooksCreate.mock.invocationCallOrder[0]!,
    );

    // 2. Webhook created against the project with the task+added filter and
    // the strict-direct-lookup URL.
    const createArg = mockWebhooksCreate.mock.calls[0]![0];
    expect(createArg.resourceGid).toBe("p-1");
    expect(createArg.filters).toEqual([
      { resource_type: "task", action: "added" },
    ]);
    expect(createArg.target).toBe(
      "https://app.example.test/api/webhooks/asana?workflowId=wf-1&nodeId=node-1",
    );

    // 3. Patch carries the handshake-persisted secret forward.
    expect(patch).toEqual({
      webhookEnabled: true,
      projectId: "p-1",
      webhookId: "wh-1",
      hookSecretEncrypted: "enc(secret-1)",
      notificationUrl:
        "https://app.example.test/api/webhooks/asana?workflowId=wf-1&nodeId=node-1",
      handshakePending: false,
    });
  });

  it("uses the task+changed filter for task_updated_in_project", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-2", active: true });
    mockFind.mockResolvedValueOnce({
      id: "tr-1",
      config: { hookSecretEncrypted: "enc(s)" },
    });
    await buildAsanaActivate("task_updated_in_project")({
      node: node({ projectId: "p-1" }),
      integration: integration(),
      workflowId: "wf-1",
    });
    expect(mockWebhooksCreate.mock.calls[0]![0].filters).toEqual([
      { resource_type: "task", action: "changed" },
    ]);
  });

  it("ASANA-2: uses the field-scoped and subtype-scoped server filters per trigger type", async () => {
    const cases = [
      {
        type: "task_completed" as const,
        filters: [{ resource_type: "task", action: "changed", fields: ["completed"] }],
      },
      {
        type: "task_assigned" as const,
        filters: [{ resource_type: "task", action: "changed", fields: ["assignee"] }],
      },
      {
        type: "comment_added_to_task" as const,
        filters: [
          {
            resource_type: "story",
            action: "added",
            resource_subtype: "comment_added",
          },
        ],
      },
    ];
    for (const c of cases) {
      mockWebhooksCreate.mockResolvedValueOnce({ gid: `wh-${c.type}`, active: true });
      mockFind.mockResolvedValueOnce({
        id: "tr-1",
        config: { hookSecretEncrypted: "enc(s)" },
      });
      await buildAsanaActivate(c.type)({
        node: node({ projectId: "p-1" }),
        integration: integration(),
        workflowId: "wf-1",
      });
      const lastCall =
        mockWebhooksCreate.mock.calls[mockWebhooksCreate.mock.calls.length - 1]!;
      expect(lastCall[0].filters).toEqual(c.filters);
      // Same per-(workflow,node) strict-direct-lookup URL and pending
      // pre-upsert as the ASANA-1 triggers (shared lifecycle).
      const upsertArg = mockUpsert.mock.calls[mockUpsert.mock.calls.length - 1]![0];
      expect(upsertArg.eventType).toBe(c.type);
      expect(upsertArg.config).toMatchObject({ handshakePending: true });
    }
  });

  it("routes the provider call through refreshAndRetry (hourly tokens)", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-1", active: true });
    mockFind.mockResolvedValueOnce({
      id: "tr-1",
      config: { hookSecretEncrypted: "enc(s)" },
    });
    await activate({
      node: node({ projectId: "p-1" }),
      integration: integration(),
      workflowId: "wf-1",
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "asana",
      providerAccountId: "marcus@example.test",
    });
  });
});

describe("buildAsanaActivate — failure paths", () => {
  it("throws without a projectId (no upsert, no provider call)", async () => {
    await expect(
      activate({
        node: node({}),
        integration: integration(),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/projectId is required/);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockWebhooksCreate).not.toHaveBeenCalled();
  });

  it("throws on a legacy row without connectedByUserId", async () => {
    await expect(
      activate({
        node: node({ projectId: "p-1" }),
        integration: integration({ connectedByUserId: null }),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/connectedByUserId/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("propagates a webhook-creation failure (activation aborts)", async () => {
    mockWebhooksCreate.mockRejectedValueOnce(new Error("Asana POST /webhooks failed: no"));
    await expect(
      activate({
        node: node({ projectId: "p-1" }),
        integration: integration(),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/failed/);
  });

  it("fails closed + best-effort deletes the webhook when no secret was persisted", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-orphan", active: true });
    mockFind.mockResolvedValueOnce({ id: "tr-1", config: {} }); // no secret
    mockWebhooksDelete.mockResolvedValueOnce(undefined);

    await expect(
      activate({
        node: node({ projectId: "p-1" }),
        integration: integration(),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/did not persist a secret/);
    expect(mockWebhooksDelete).toHaveBeenCalledTimes(1);
    expect(mockWebhooksDelete.mock.calls[0]![0].webhookGid).toBe("wh-orphan");
  });

  it("still throws the handshake error when the orphan-webhook cleanup itself fails", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({ gid: "wh-orphan", active: true });
    mockFind.mockResolvedValueOnce(null);
    mockWebhooksDelete.mockRejectedValueOnce(new Error("delete also failed"));

    await expect(
      activate({
        node: node({ projectId: "p-1" }),
        integration: integration(),
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/did not persist a secret/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// Tests for the shared Asana deactivation hook — Slice 5.ASANA-1.
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "asana",
    eventType: "new_task_in_project",
    nodeId: "node-1",
    config,
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  } as never;
}

function integration() {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "asana",
    providerAccountId: "marcus@example.test",
    displayName: null,
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: [],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "",
    updatedAt: "",
  } as never;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhooksDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("asanaSharedDeactivate", () => {
  it("deletes the webhook by the stored gid", async () => {
    mockWebhooksDelete.mockResolvedValueOnce(undefined);
    await asanaSharedDeactivate({
      trigger: trigger({ webhookId: "wh-1" }),
      integration: integration(),
    });
    expect(mockWebhooksDelete.mock.calls[0]![0].webhookGid).toBe("wh-1");
  });

  it("skips silently when the row has no webhookId (aborted activation)", async () => {
    await asanaSharedDeactivate({
      trigger: trigger({ handshakePending: true }),
      integration: integration(),
    });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (already gone server-side)", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(new NotFoundError("webhook wh-1"));
    await expect(
      asanaSharedDeactivate({
        trigger: trigger({ webhookId: "wh-1" }),
        integration: integration(),
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows IntegrationActionRequiredError (dead credential; best-effort cleanup)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "asana",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      asanaSharedDeactivate({
        trigger: trigger({ webhookId: "wh-1" }),
        integration: integration(),
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors to the lifecycle orchestrator", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(new Error("Asana 500"));
    await expect(
      asanaSharedDeactivate({
        trigger: trigger({ webhookId: "wh-1" }),
        integration: integration(),
      }),
    ).rejects.toThrow(/500/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Pure-function tests for the Asana normalizers + P-S2 project filters —
// Slice 5.ASANA-1 + ASANA-2.
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const ev = {
  user: { gid: "actor-1" },
  resource: {
    gid: "t-1",
    resource_type: "task",
    resource_subtype: "default_task",
  },
  parent: { gid: "p-1", resource_type: "project" },
  action: "added",
  created_at: "2026-07-04T05:00:00.000Z",
};

const fetchedTask: AsanaTask = {
  gid: "t-1",
  name: "Fetched task name",
  notes: null,
  completed: true,
  completed_at: "2026-07-06T09:00:00.000Z",
  due_on: null,
  due_at: null,
  assignee: { gid: "u-9", name: "Dana Assignee" },
  projects: [{ gid: "p-1" }],
  permalink_url: "https://app.asana.com/0/p-1/t-1",
  created_at: "2026-07-01T00:00:00.000Z",
  modified_at: "2026-07-06T09:00:00.000Z",
};

const fetchedStory: AsanaStoryDetail = {
  gid: "s-77",
  text: "A comment body",
  resource_subtype: "comment_added",
  created_at: "2026-07-06T10:00:00.000Z",
  created_by: { gid: "u-3", name: "Casey Commenter" },
  target: { gid: "t-1" },
};

describe("eventMatchesTriggerType (ASANA-2 per-row matcher)", () => {
  it("matches task+added / task+changed against the ASANA-1 types", () => {
    expect(eventMatchesTriggerType(ev, "new_task_in_project")).toBe(true);
    expect(
      eventMatchesTriggerType({ ...ev, action: "changed" }, "task_updated_in_project"),
    ).toBe(true);
    expect(eventMatchesTriggerType({ ...ev, action: "deleted" }, "new_task_in_project")).toBe(false);
    expect(eventMatchesTriggerType({}, "new_task_in_project")).toBe(false);
  });

  it("task_completed: requires task+changed and, when change is present, field=completed", () => {
    const changed = { ...ev, action: "changed" };
    expect(eventMatchesTriggerType(changed, "task_completed")).toBe(true); // no change obj → post-fetch gates
    expect(
      eventMatchesTriggerType(
        { ...changed, change: { field: "completed", action: "changed" } },
        "task_completed",
      ),
    ).toBe(true);
    expect(
      eventMatchesTriggerType(
        { ...changed, change: { field: "name", action: "changed" } },
        "task_completed",
      ),
    ).toBe(false);
    expect(eventMatchesTriggerType(ev, "task_completed")).toBe(false); // added, not changed
  });

  it("task_assigned: requires task+changed and, when change is present, field=assignee", () => {
    const changed = { ...ev, action: "changed" };
    expect(
      eventMatchesTriggerType(
        { ...changed, change: { field: "assignee", action: "changed" } },
        "task_assigned",
      ),
    ).toBe(true);
    expect(
      eventMatchesTriggerType(
        { ...changed, change: { field: "due_on", action: "changed" } },
        "task_assigned",
      ),
    ).toBe(false);
  });

  it("comment_added_to_task: requires story+added with resource_subtype comment_added", () => {
    const story = {
      ...ev,
      resource: { gid: "s-77", resource_type: "story", resource_subtype: "comment_added" },
    };
    expect(eventMatchesTriggerType(story, "comment_added_to_task")).toBe(true);
    expect(
      eventMatchesTriggerType(
        { ...story, resource: { gid: "s-77", resource_type: "story", resource_subtype: "assigned" } },
        "comment_added_to_task",
      ),
    ).toBe(false);
    expect(
      eventMatchesTriggerType({ ...story, action: "removed" }, "comment_added_to_task"),
    ).toBe(false);
    // A task event never matches the story trigger.
    expect(eventMatchesTriggerType(ev, "comment_added_to_task")).toBe(false);
  });
});

describe("normalizeNewTaskInProject", () => {
  it("emits the canonical compact payload with the short eventType", () => {
    const event = normalizeNewTaskInProject(ev, { projectId: "p-1" });
    expect(event.provider).toBe("asana");
    expect(event.eventType).toBe("new_task_in_project");
    expect(event.eventId).toBe("new_task_in_project:p-1:t-1");
    expect(event.occurredAt).toBe("2026-07-04T05:00:00.000Z");
    expect(event.providerAccountId).toBe("p-1");
    expect(event.payload).toEqual({
      changeKind: "new_task_in_project",
      taskGid: "t-1",
      projectGid: "p-1",
      actorGid: "actor-1",
      action: "added",
      resourceSubtype: "default_task",
      createdAt: "2026-07-04T05:00:00.000Z",
    });
  });

  it("is deterministic for the same logical event (dedup key)", () => {
    const a = normalizeNewTaskInProject(ev, { projectId: "p-1" });
    const b = normalizeNewTaskInProject(ev, { projectId: "p-1" });
    expect(a.eventId).toBe(b.eventId);
  });

  it("collapses Asana's multi-parent creation delivery: two task+added events for the same task with different created_at share one dedup key (live double-fire, 2026-07-04)", () => {
    // Live repro: creating ONE task delivered task+added twice (one membership
    // event per parent — project and section), created_at 138ms apart. The
    // timestamp must NOT be part of the key or one creation fires two runs.
    const first = normalizeNewTaskInProject(
      { ...ev, created_at: "2026-07-04T15:26:33.839Z" },
      { projectId: "p-1" },
    );
    const second = normalizeNewTaskInProject(
      { ...ev, created_at: "2026-07-04T15:26:33.977Z" },
      { projectId: "p-1" },
    );
    expect(first.eventId).toBe(second.eventId);
    expect(first.eventId).toBe("new_task_in_project:p-1:t-1");
  });

  it("keeps the timestamp discriminator when the task gid is missing (malformed events never share a key)", () => {
    const a = normalizeNewTaskInProject(
      { created_at: "2026-07-04T05:00:00.000Z" },
      { projectId: "p-1" },
    );
    const b = normalizeNewTaskInProject(
      { created_at: "2026-07-04T06:00:00.000Z" },
      { projectId: "p-1" },
    );
    expect(a.eventId).not.toBe(b.eventId);
    expect(a.eventId).toContain("no-task");
  });

  it("degrades safely on a minimal event (nulls, no throw)", () => {
    const event = normalizeNewTaskInProject({}, { projectId: null });
    expect(event.eventId).toContain("no-project");
    expect(event.eventId).toContain("no-task");
    expect(event.providerAccountId).toBe("unknown");
    expect(event.payload.taskGid).toBeNull();
    expect(event.payload.actorGid).toBeNull();
  });
});

describe("normalizeTaskUpdatedInProject", () => {
  it("emits the task_updated shape with its own dedup namespace", () => {
    const event = normalizeTaskUpdatedInProject(
      { ...ev, action: "changed" },
      { projectId: "p-1" },
    );
    expect(event.eventType).toBe("task_updated_in_project");
    expect(event.eventId).toBe(
      "task_updated_in_project:p-1:t-1:2026-07-04T05:00:00.000Z",
    );
    expect(event.payload.changeKind).toBe("task_updated_in_project");
  });
});

describe("P-S2 project filters", () => {
  const matchEvent = normalizeNewTaskInProject(ev, { projectId: "p-1" });

  it("matches when the row's projectId equals the event's projectGid", () => {
    const parsed = asanaNewTaskInProjectFilter.parseConfig({
      projectId: "p-1",
      webhookId: "wh-1",
      extra: "ignored",
    });
    expect(asanaNewTaskInProjectFilter.evaluate(matchEvent, parsed)).toEqual({
      kind: "match",
    });
  });

  it("drops cross-project events (workflow watching project B never fires on A)", () => {
    const parsed = asanaNewTaskInProjectFilter.parseConfig({ projectId: "p-OTHER" });
    const result = asanaNewTaskInProjectFilter.evaluate(matchEvent, parsed);
    expect(result.kind).toBe("no-match");
  });

  it("fails closed on a config without projectId", () => {
    expect(() => asanaNewTaskInProjectFilter.parseConfig({})).toThrow();
    expect(() =>
      asanaTaskUpdatedInProjectFilter.parseConfig({ projectId: "" }),
    ).toThrow();
  });

  it("never matches an event with a null projectGid", () => {
    const nullEvent = normalizeNewTaskInProject(ev, { projectId: null });
    const parsed = asanaNewTaskInProjectFilter.parseConfig({ projectId: "p-1" });
    expect(asanaNewTaskInProjectFilter.evaluate(nullEvent, parsed).kind).toBe(
      "no-match",
    );
  });

  it("task_updated filter narrows by project the same way", () => {
    const updated = normalizeTaskUpdatedInProject(
      { ...ev, action: "changed" },
      { projectId: "p-9" },
    );
    const parsed = asanaTaskUpdatedInProjectFilter.parseConfig({ projectId: "p-9" });
    expect(asanaTaskUpdatedInProjectFilter.evaluate(updated, parsed)).toEqual({
      kind: "match",
    });
  });
});

describe("normalizeTaskCompleted (ASANA-2)", () => {
  const changedEv = { ...ev, action: "changed" };

  it("emits the bounded task_completed payload from the post-fetched task", () => {
    const event = normalizeTaskCompleted(changedEv, {
      projectId: "p-1",
      task: fetchedTask,
    });
    expect(event.provider).toBe("asana");
    expect(event.eventType).toBe("task_completed");
    expect(event.eventId).toBe("task_completed:p-1:t-1");
    expect(event.occurredAt).toBe("2026-07-06T09:00:00.000Z"); // completed_at wins
    expect(event.providerAccountId).toBe("p-1");
    expect(event.payload).toEqual({
      changeKind: "task_completed",
      taskGid: "t-1",
      taskName: "Fetched task name",
      projectGid: "p-1",
      completedAt: "2026-07-06T09:00:00.000Z",
      actorGid: "actor-1",
      createdAt: "2026-07-04T05:00:00.000Z",
    });
  });

  it("dedup key is timestamp-free and task-scoped (multi-parent/redelivery collapse)", () => {
    const a = normalizeTaskCompleted(
      { ...changedEv, created_at: "2026-07-06T09:00:00.100Z" },
      { projectId: "p-1", task: fetchedTask },
    );
    const b = normalizeTaskCompleted(
      { ...changedEv, created_at: "2026-07-06T09:00:00.900Z" },
      { projectId: "p-1", task: fetchedTask },
    );
    expect(a.eventId).toBe(b.eventId);
    expect(a.eventId).not.toContain("2026-07-06T09:00");
  });
});

describe("normalizeTaskAssigned (ASANA-2)", () => {
  const changedEv = { ...ev, action: "changed" };

  it("emits the bounded task_assigned payload with the post-fetched assignee", () => {
    const event = normalizeTaskAssigned(changedEv, {
      projectId: "p-1",
      task: fetchedTask,
      assigneeGid: "u-9",
    });
    expect(event.eventType).toBe("task_assigned");
    expect(event.eventId).toBe("task_assigned:p-1:t-1:u-9");
    expect(event.payload).toEqual({
      changeKind: "task_assigned",
      taskGid: "t-1",
      taskName: "Fetched task name",
      projectGid: "p-1",
      newAssigneeGid: "u-9",
      newAssigneeName: "Dana Assignee",
      actorGid: "actor-1",
      createdAt: "2026-07-04T05:00:00.000Z",
    });
  });

  it("dedup key is (task, assignee)-scoped and timestamp-free: same assignee collapses, different assignee fires again", () => {
    const sameA = normalizeTaskAssigned(
      { ...changedEv, created_at: "2026-07-06T09:00:00.100Z" },
      { projectId: "p-1", task: fetchedTask, assigneeGid: "u-9" },
    );
    const sameB = normalizeTaskAssigned(
      { ...changedEv, created_at: "2026-07-06T09:00:00.900Z" },
      { projectId: "p-1", task: fetchedTask, assigneeGid: "u-9" },
    );
    const other = normalizeTaskAssigned(changedEv, {
      projectId: "p-1",
      task: { ...fetchedTask, assignee: { gid: "u-10", name: "Other" } },
      assigneeGid: "u-10",
    });
    expect(sameA.eventId).toBe(sameB.eventId);
    expect(other.eventId).not.toBe(sameA.eventId);
  });
});

describe("normalizeCommentAddedToTask (ASANA-2)", () => {
  const storyEv = {
    ...ev,
    resource: {
      gid: "s-77",
      resource_type: "story",
      resource_subtype: "comment_added",
    },
    parent: { gid: "t-1", resource_type: "task" },
  };

  it("emits the bounded comment payload from the post-fetched story", () => {
    const event = normalizeCommentAddedToTask(storyEv, {
      projectId: "p-1",
      story: fetchedStory,
    });
    expect(event.eventType).toBe("comment_added_to_task");
    expect(event.eventId).toBe("comment_added_to_task:p-1:s-77");
    expect(event.occurredAt).toBe("2026-07-06T10:00:00.000Z");
    expect(event.payload).toEqual({
      changeKind: "comment_added_to_task",
      storyGid: "s-77",
      taskGid: "t-1",
      projectGid: "p-1",
      commentText: "A comment body",
      authorGid: "u-3",
      authorName: "Casey Commenter",
      createdAt: "2026-07-06T10:00:00.000Z",
    });
  });

  it("dedup key is the durable story gid (timestamp-free; every new comment is a new key)", () => {
    const a = normalizeCommentAddedToTask(storyEv, {
      projectId: "p-1",
      story: fetchedStory,
    });
    const b = normalizeCommentAddedToTask(
      { ...storyEv, created_at: "2026-07-06T10:00:59.000Z" },
      { projectId: "p-1", story: fetchedStory },
    );
    expect(a.eventId).toBe(b.eventId);
    const otherComment = normalizeCommentAddedToTask(storyEv, {
      projectId: "p-1",
      story: { ...fetchedStory, gid: "s-78" },
    });
    expect(otherComment.eventId).not.toBe(a.eventId);
  });

  it("truncates comment text to COMMENT_TEXT_MAX and falls back to the event parent for the task gid", () => {
    const long = "x".repeat(COMMENT_TEXT_MAX + 500);
    const event = normalizeCommentAddedToTask(storyEv, {
      projectId: "p-1",
      story: { ...fetchedStory, text: long, target: null },
    });
    expect((event.payload.commentText as string).length).toBe(COMMENT_TEXT_MAX);
    expect(event.payload.taskGid).toBe("t-1"); // ev.parent fallback
  });
});

describe("ASANA-2 P-S2 filters", () => {
  it("task_completed / comment_added filters narrow by project", () => {
    const completed = normalizeTaskCompleted(
      { ...ev, action: "changed" },
      { projectId: "p-1", task: fetchedTask },
    );
    const parsedMatch = asanaTaskCompletedFilter.parseConfig({ projectId: "p-1" });
    const parsedOther = asanaTaskCompletedFilter.parseConfig({ projectId: "p-X" });
    expect(asanaTaskCompletedFilter.evaluate(completed, parsedMatch).kind).toBe("match");
    expect(asanaTaskCompletedFilter.evaluate(completed, parsedOther).kind).toBe("no-match");

    const comment = normalizeCommentAddedToTask(
      {
        ...ev,
        resource: { gid: "s-77", resource_type: "story", resource_subtype: "comment_added" },
      },
      { projectId: "p-1", story: fetchedStory },
    );
    const cMatch = asanaCommentAddedToTaskFilter.parseConfig({ projectId: "p-1" });
    expect(asanaCommentAddedToTaskFilter.evaluate(comment, cMatch).kind).toBe("match");
  });

  it("task_assigned filter: project narrowing + optional assignee filter", () => {
    const assigned = normalizeTaskAssigned(
      { ...ev, action: "changed" },
      { projectId: "p-1", task: fetchedTask, assigneeGid: "u-9" },
    );

    // No assignee filter → any assignment in the project matches.
    const anyAssignee = asanaTaskAssignedFilter.parseConfig({ projectId: "p-1" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, anyAssignee).kind).toBe("match");

    // Builder-cleared "" behaves as no filter.
    const cleared = asanaTaskAssignedFilter.parseConfig({ projectId: "p-1", assigneeId: "" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, cleared).kind).toBe("match");

    // Matching assignee filter.
    const matching = asanaTaskAssignedFilter.parseConfig({ projectId: "p-1", assigneeId: "u-9" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, matching).kind).toBe("match");

    // Non-matching assignee filter.
    const other = asanaTaskAssignedFilter.parseConfig({ projectId: "p-1", assigneeId: "u-42" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, other).kind).toBe("no-match");

    // Wrong project loses before the assignee check.
    const wrongProject = asanaTaskAssignedFilter.parseConfig({ projectId: "p-X", assigneeId: "u-9" });
    expect(asanaTaskAssignedFilter.evaluate(assigned, wrongProject).kind).toBe("no-match");
  });

  it("ASANA-2 filters fail closed without a projectId", () => {
    expect(() => asanaTaskCompletedFilter.parseConfig({})).toThrow();
    expect(() => asanaTaskAssignedFilter.parseConfig({ assigneeId: "u-9" })).toThrow();
    expect(() => asanaCommentAddedToTaskFilter.parseConfig({ projectId: "" })).toThrow();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former receive.test.ts
// Tests for the shared Asana webhook receive helper — Slice 5.ASANA-1 +
// ASANA-2 (post-fetch enrichment for task_completed / task_assigned /
// comment_added_to_task).
// Uses the REAL signature verifier (crypto HMAC) with a reversible fake
// for the token-encryption seam, and mocks the trigger-row repo, the
// integration lookup, refreshAndRetry, and the Asana task/story wrappers.
// ---------------------------------------------------------------------------
describe("receive (lifecycle)", () => {

const SECRET = "asana-hook-secret-1";

function sign(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function makeRequest(
  body: string,
  opts: {
    sig?: string | null;
    hookSecret?: string;
    query?: string;
  } = {},
): Request {
  const query = opts.query ?? "?workflowId=wf&nodeId=n";
  const headers: Record<string, string> = {};
  if (opts.sig) headers["x-hook-signature"] = opts.sig;
  if (opts.hookSecret !== undefined) headers["x-hook-secret"] = opts.hookSecret;
  return new Request(`https://app.test/api/webhooks/asana${query}`, {
    method: "POST",
    headers,
    body,
  });
}

function triggerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tr-1",
    workflowId: "wf",
    workflowAccountId: "acct-wf",
    userId: "user-1",
    provider: "asana",
    eventType: "new_task_in_project",
    nodeId: "n",
    config: {
      projectId: "p-1",
      hookSecretEncrypted: `enc(${SECRET})`,
      webhookEnabled: true,
      handshakePending: false,
    },
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function taskEvent(overrides: Record<string, unknown> = {}) {
  return {
    user: { gid: "actor-1" },
    resource: {
      gid: "t-1",
      resource_type: "task",
      resource_subtype: "default_task",
    },
    parent: { gid: "p-1", resource_type: "project" },
    action: "added",
    created_at: "2026-07-04T05:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockFind.mockReset();
  mockUpdateConfig.mockReset();
  mockGetActiveForExecution.mockReset();
  mockRefreshAndRetry.mockReset();
  mockTasksGet.mockReset();
  mockStoriesGet.mockReset();
  mockGetActiveForExecution.mockResolvedValue({
    accountId: "acct-wf",
    provider: "asana",
    providerAccountId: "asana-user@example.test",
  });
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) =>
      i.apiCall("access-token-123"),
  );
});

describe("receiveAsanaWebhook — X-Hook-Secret handshake", () => {
  it("stores the secret ENCRYPTED on a pending row and echoes it", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({
        config: { projectId: "p-1", handshakePending: true, webhookEnabled: false },
      }),
    );
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "fresh-secret" }),
      rawBody: "",
    });
    expect(result).toEqual({ kind: "handshake", secret: "fresh-secret" });
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [rowId, newConfig] = mockUpdateConfig.mock.calls[0]!;
    expect(rowId).toBe("tr-1");
    expect(newConfig.hookSecretEncrypted).toBe("enc(fresh-secret)");
    // Never stored in plaintext.
    expect(JSON.stringify(newConfig)).not.toContain('"fresh-secret"');
  });

  it("rejects a handshake against an ARMED row (secret already stored) — no overwrite, no echo", async () => {
    mockFind.mockResolvedValueOnce(triggerRow()); // armed row
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "attacker-secret" }),
      rawBody: "",
    });
    expect(result).toEqual({ kind: "handshake_rejected", reason: "not_pending" });
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("rejects a handshake with no matching trigger row", async () => {
    mockFind.mockResolvedValueOnce(null);
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "s" }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "unknown_trigger",
    });
  });

  it("rejects a handshake without query params", async () => {
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "s", query: "" }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "missing_query",
    });
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("rejects an oversized handshake secret", async () => {
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "x".repeat(300) }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "malformed_secret",
    });
  });

  it("rejects a handshake against a non-asana row", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ provider: "monday" }));
    const result = await receiveAsanaWebhook({
      request: makeRequest("", { hookSecret: "s" }),
      rawBody: "",
    });
    expect(result).toEqual({
      kind: "handshake_rejected",
      reason: "unknown_trigger",
    });
  });
});

describe("receiveAsanaWebhook — signature (events fail closed)", () => {
  it("throws InvalidSignatureError on a bad signature", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign("a different body") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when the header is absent", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: null }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies with the ROW's own secret (a different webhook's secret fails)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body, "some-other-secret") }),
        rawBody: body,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies over the RAW body bytes (re-serialized body fails)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = '{ "events": [] }';
    const reserialized = JSON.stringify(JSON.parse(body));
    expect(reserialized).not.toBe(body);
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(reserialized, { sig: sign(body) }),
        rawBody: reserialized,
      }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);
  });

  it("returns unverifiable (never dispatches) for a secretless row", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ config: { projectId: "p-1", handshakePending: true } }),
    );
    const body = JSON.stringify({ events: [taskEvent()] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "unverifiable" });
  });
});

describe("receiveAsanaWebhook — routing + normalization", () => {
  it("returns unknown_workflow without query params / row / for foreign rows", async () => {
    const body = JSON.stringify({ events: [] });
    expect(
      await receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body), query: "" }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });

    mockFind.mockResolvedValueOnce(null);
    expect(
      await receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });

    mockFind.mockResolvedValueOnce(triggerRow({ provider: "trello" }));
    expect(
      await receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).toEqual({ kind: "unknown_workflow" });
  });

  it("acks the 8h heartbeat (empty events) — verified but no dispatch", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "heartbeat" });
  });

  it("normalizes a task-added event with the SHORT eventType + row-attributed project", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result.kind).toBe("events");
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      provider: "asana",
      eventType: "new_task_in_project",
      eventId: "new_task_in_project:p-1:t-1",
      occurredAt: "2026-07-04T05:00:00.000Z",
      providerAccountId: "p-1",
      payload: {
        changeKind: "new_task_in_project",
        taskGid: "t-1",
        projectGid: "p-1",
        actorGid: "actor-1",
        action: "added",
        resourceSubtype: "default_task",
        createdAt: "2026-07-04T05:00:00.000Z",
      },
    });
    // The per-webhook secret never leaks into the normalized event.
    expect(JSON.stringify(result.events[0])).not.toContain(SECRET);
  });

  it("drops unsupported events (stories) and cross-type events (changed on a new_task row)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "new_task_in_project" }));
    const body = JSON.stringify({
      events: [
        taskEvent({ resource: { gid: "s-1", resource_type: "story" } }),
        taskEvent({ action: "changed" }),
        taskEvent({ action: "deleted" }),
        taskEvent(), // the only one that matches
      ],
    });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("new_task_in_project");
  });

  it("produces the SAME eventId for a redelivery (dedup determinism)", async () => {
    const body = JSON.stringify({ events: [taskEvent()] });
    mockFind.mockResolvedValue(triggerRow());
    const first = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    const second = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (first.kind !== "events" || second.kind !== "events") {
      throw new Error("expected events");
    }
    expect(first.events[0]!.eventId).toBe(second.events[0]!.eventId);
  });

  it("routes task-changed events on a task_updated row", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "task_updated_in_project" }),
    );
    const body = JSON.stringify({ events: [taskEvent({ action: "changed" })] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events[0]!.eventType).toBe("task_updated_in_project");
    expect(result.events[0]!.payload.changeKind).toBe("task_updated_in_project");
  });

  it("ASANA-1 rows never post-fetch (no integration lookup, no provider call)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow());
    const body = JSON.stringify({ events: [taskEvent()] });
    await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

// ── ASANA-2: post-fetch enrichment paths ─────────────────────────────────

const fetchedTask = {
  gid: "t-1",
  name: "Fetched task",
  notes: null,
  completed: true,
  completed_at: "2026-07-06T09:00:00.000Z",
  due_on: null,
  due_at: null,
  assignee: { gid: "u-9", name: "Dana Assignee" },
  projects: [{ gid: "p-1" }],
  permalink_url: "https://app.asana.com/0/p-1/t-1",
  created_at: "2026-07-01T00:00:00.000Z",
  modified_at: "2026-07-06T09:00:00.000Z",
};

function changedEvent(field: string) {
  return taskEvent({
    action: "changed",
    change: { field, action: "changed" },
  });
}

describe("receiveAsanaWebhook — task_completed (ASANA-2)", () => {
  it("post-fetches the task and dispatches ONLY when completed === true", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockTasksGet.mockResolvedValueOnce(fetchedTask);
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.eventType).toBe("task_completed");
    expect(event.eventId).toBe("task_completed:p-1:t-1");
    expect(event.payload.taskName).toBe("Fetched task");
    expect(event.payload.completedAt).toBe("2026-07-06T09:00:00.000Z");
    expect(mockTasksGet).toHaveBeenCalledWith({
      accessToken: "access-token-123",
      taskGid: "t-1",
    });
    // The integration lookup used the ROW's workflow account.
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "acct-wf",
      "asana",
      null,
    );
    // No token/secret leaks into the dispatched event.
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("access-token-123");
    expect(serialized).not.toContain(SECRET);
  });

  it("drops the event when the post-fetch shows the task is NOT completed (uncomplete race / spurious delivery)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockTasksGet.mockResolvedValueOnce({ ...fetchedTask, completed: false });
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops non-completed-field changes before any post-fetch", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    const body = JSON.stringify({ events: [changedEvent("name")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockTasksGet).not.toHaveBeenCalled();
  });

  it("drops quietly when the task is gone (404 between event and fetch)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("task t-1", "gone"));
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops quietly when the credential is dead (action required) — never dispatch what we can't verify", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-wf",
        provider: "asana",
        providerAccountId: null,
        reason: "reauthorize",
      } as never),
    );
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("PROPAGATES unexpected post-fetch errors so the route 5xxes and Asana redelivers", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("Asana 500"));
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    await expect(
      receiveAsanaWebhook({
        request: makeRequest(body, { sig: sign(body) }),
        rawBody: body,
      }),
    ).rejects.toThrow("Asana 500");
  });

  it("drops quietly when the workflow account has no active Asana integration", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_completed" }));
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops quietly when the row has no workflowAccountId (legacy/corrupt row)", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "task_completed", workflowAccountId: null }),
    );
    const body = JSON.stringify({ events: [changedEvent("completed")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
  });
});

describe("receiveAsanaWebhook — task_assigned (ASANA-2)", () => {
  it("dispatches with the POST-FETCHED assignee (authoritative, not the compact event)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_assigned" }));
    mockTasksGet.mockResolvedValueOnce({ ...fetchedTask, completed: false });
    const body = JSON.stringify({ events: [changedEvent("assignee")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.eventType).toBe("task_assigned");
    expect(event.eventId).toBe("task_assigned:p-1:t-1:u-9");
    expect(event.payload.newAssigneeGid).toBe("u-9");
    expect(event.payload.newAssigneeName).toBe("Dana Assignee");
  });

  it("does NOT fire on unassignment (post-fetch shows no assignee)", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_assigned" }));
    mockTasksGet.mockResolvedValueOnce({ ...fetchedTask, assignee: null });
    const body = JSON.stringify({ events: [changedEvent("assignee")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops non-assignee-field changes before any post-fetch", async () => {
    mockFind.mockResolvedValueOnce(triggerRow({ eventType: "task_assigned" }));
    const body = JSON.stringify({ events: [changedEvent("due_on")] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockTasksGet).not.toHaveBeenCalled();
  });
});

describe("receiveAsanaWebhook — comment_added_to_task (ASANA-2)", () => {
  const storyEvent = taskEvent({
    resource: {
      gid: "s-77",
      resource_type: "story",
      resource_subtype: "comment_added",
    },
    parent: { gid: "t-1", resource_type: "task" },
    action: "added",
  });

  const fetchedStory = {
    gid: "s-77",
    text: "A comment body",
    resource_subtype: "comment_added",
    created_at: "2026-07-06T10:00:00.000Z",
    created_by: { gid: "u-3", name: "Casey Commenter" },
    target: { gid: "t-1" },
  };

  it("post-fetches the story (stories:read) and dispatches the bounded comment payload", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "comment_added_to_task" }),
    );
    mockStoriesGet.mockResolvedValueOnce(fetchedStory);
    const body = JSON.stringify({ events: [storyEvent] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.eventType).toBe("comment_added_to_task");
    expect(event.eventId).toBe("comment_added_to_task:p-1:s-77");
    expect(event.payload.commentText).toBe("A comment body");
    expect(event.payload.authorName).toBe("Casey Commenter");
    expect(event.payload.taskGid).toBe("t-1");
    expect(mockStoriesGet).toHaveBeenCalledWith({
      accessToken: "access-token-123",
      storyGid: "s-77",
    });
    // No token/secret leaks into the dispatched event.
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("access-token-123");
    expect(serialized).not.toContain(SECRET);
  });

  it("drops when the post-fetched story is not a comment (defense-in-depth subtype check)", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "comment_added_to_task" }),
    );
    mockStoriesGet.mockResolvedValueOnce({
      ...fetchedStory,
      resource_subtype: "assigned",
    });
    const body = JSON.stringify({ events: [storyEvent] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });

  it("drops non-comment story events before any post-fetch (subtype mismatch on the compact event)", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "comment_added_to_task" }),
    );
    const notComment = taskEvent({
      resource: { gid: "s-80", resource_type: "story", resource_subtype: "assigned" },
      action: "added",
    });
    const body = JSON.stringify({ events: [notComment] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
    expect(mockStoriesGet).not.toHaveBeenCalled();
  });

  it("drops quietly when the story is gone (404)", async () => {
    mockFind.mockResolvedValueOnce(
      triggerRow({ eventType: "comment_added_to_task" }),
    );
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("story s-77", "gone"));
    const body = JSON.stringify({ events: [storyEvent] });
    const result = await receiveAsanaWebhook({
      request: makeRequest(body, { sig: sign(body) }),
      rawBody: body,
    });
    expect(result).toEqual({ kind: "events", events: [] });
  });
});

});
