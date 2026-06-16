/**
 * @jest-environment node
 *
 * Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-3 / CS-BD-4A — credential-free export sanitizer.
 * Plants fake secrets / tokens / emails / provider labels / owner ids and proves they NEVER
 * appear in the export, while the safe graph shape (ids, provider/action types, layout, intent
 * config) is preserved.
 */

import {
  sanitizeConfigForExport,
  sanitizeWorkflowDefinitionForExport,
  buildWorkflowExport,
  buildAccountWorkflowsExport,
  ACCOUNT_WORKFLOW_EXPORT_LIMIT,
  REDACTION_MARKER,
  EXPORT_SOURCE,
  EXPORT_SCHEMA_VERSION,
} from "@/services/workflows/exportWorkflow";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { WorkflowRecord } from "@/repositories/workflows";

describe("sanitizeConfigForExport — sensitive keys", () => {
  it("redacts token / secret / password / apiKey / credential-style keys (any depth)", () => {
    const out = sanitizeConfigForExport({
      accessToken: "ya29.abcDEF123456",
      refreshToken: "1//xyzREFRESH",
      apiKey: "sk_live_supersecret",
      clientSecret: "csecret",
      password: "hunter2",
      webhookSecret: "whsec_abcdef123456",
      authorization: "Bearer eyJhbGciOiJIUzI1NiToken",
      credential: { nested: "x" },
      nested: { oauthToken: "tok_nested", channel: "C123" },
    });
    expect(out.accessToken).toBe(REDACTION_MARKER);
    expect(out.refreshToken).toBe(REDACTION_MARKER);
    expect(out.apiKey).toBe(REDACTION_MARKER);
    expect(out.clientSecret).toBe(REDACTION_MARKER);
    expect(out.password).toBe(REDACTION_MARKER);
    expect(out.webhookSecret).toBe(REDACTION_MARKER);
    expect(out.authorization).toBe(REDACTION_MARKER);
    expect(out.credential).toBe(REDACTION_MARKER);
    // nested sensitive key redacted; sibling non-sensitive value kept
    expect((out.nested as Record<string, unknown>).oauthToken).toBe(REDACTION_MARKER);
    expect((out.nested as Record<string, unknown>).channel).toBe("C123");
  });

  it("redacts account/owner identity keys", () => {
    const out = sanitizeConfigForExport({
      integrationId: "int_abc",
      provider_account_id: "acct_live_999",
      connected_by_user_id: "user-123",
      credentialOwnerUserId: "user-456",
      accountLabel: "Acme Slack (admin@acme.com)",
    });
    expect(out.integrationId).toBe(REDACTION_MARKER);
    expect(out.provider_account_id).toBe(REDACTION_MARKER);
    expect(out.connected_by_user_id).toBe(REDACTION_MARKER);
    expect(out.credentialOwnerUserId).toBe(REDACTION_MARKER);
    expect(out.accountLabel).toBe(REDACTION_MARKER);
  });

  it("redacts email + token substrings inside otherwise-innocuous string values", () => {
    const out = sanitizeConfigForExport({
      message: "Ping support@acme.com about this",
      note: `key is ${(["xoxb", "123456789", "abcdef"].join("-"))} and a jwt eyJhbGciOiJIUzI1NiIsInR5cCI6 here`,
      channelName: "general", // untouched
    });
    expect(out.message).not.toMatch(/support@acme\.com/);
    expect(out.message).toContain(REDACTION_MARKER);
    expect(out.message).toContain("Ping"); // surrounding intent preserved
    expect(out.note).not.toMatch((new RegExp(["xoxb", "123456789"].join("-"))));
    expect(out.note).not.toMatch(/eyJhbGci/);
    expect(out.channelName).toBe("general");
  });

  it("preserves non-secret intent config + primitives", () => {
    const out = sanitizeConfigForExport({
      channel: "C12345",
      subject: "Weekly report",
      count: 5,
      enabled: true,
      missing: null,
      tags: ["a", "b"],
    });
    expect(out).toMatchObject({
      channel: "C12345",
      subject: "Weekly report",
      count: 5,
      enabled: true,
      missing: null,
      tags: ["a", "b"],
    });
  });
});

describe("sanitizeWorkflowDefinitionForExport — graph shape", () => {
  const def: WorkflowDefinition = {
    nodes: [
      {
        id: "n1",
        kind: "trigger",
        provider: "slack",
        type: "new_message",
        displayName: "When a message arrives",
        position: { x: 10, y: 20 },
        config: { channel: "C1", botToken: (["xoxb", "secret", "token", "1234567"].join("-")) },
      } as WorkflowDefinition["nodes"][number],
      {
        id: "n2",
        kind: "action",
        provider: "gmail",
        type: "send_email",
        position: { x: 100, y: 20 },
        config: { to: "boss@acme.com", subject: "Hi", accessToken: "ya29.secrettoken1234" },
      } as WorkflowDefinition["nodes"][number],
    ],
    edges: [{ id: "e1", from: "n1", to: "n2", label: "ok" }],
  };

  it("preserves ids / kind / provider / type / displayName / position / edges", () => {
    const out = sanitizeWorkflowDefinitionForExport(def);
    expect(out.nodes[0]).toMatchObject({
      id: "n1",
      kind: "trigger",
      provider: "slack",
      type: "new_message",
      displayName: "When a message arrives",
      position: { x: 10, y: 20 },
    });
    expect(out.nodes[1]!.config.subject).toBe("Hi");
    expect(out.edges[0]).toEqual({ id: "e1", from: "n1", to: "n2", label: "ok" });
  });

  it("redacts secret config (botToken / accessToken) and email values in the graph", () => {
    const out = sanitizeWorkflowDefinitionForExport(def);
    expect(out.nodes[0]!.config.botToken).toBe(REDACTION_MARKER);
    expect(out.nodes[0]!.config.channel).toBe("C1");
    expect(out.nodes[1]!.config.accessToken).toBe(REDACTION_MARKER);
    expect(out.nodes[1]!.config.to).not.toMatch(/boss@acme\.com/);
    // whole-export stringify carries no planted secret/email
    const json = JSON.stringify(out);
    expect(json).not.toMatch((new RegExp(["xoxb", "secret", "token"].join("-"))));
    expect(json).not.toMatch(/ya29\.secrettoken/);
    expect(json).not.toMatch(/boss@acme\.com/);
  });

  it("drops unexpected/unknown node fields (whitelist defense)", () => {
    const sneaky = {
      nodes: [
        {
          id: "n1",
          kind: "action",
          provider: "slack",
          type: "post",
          position: { x: 0, y: 0 },
          config: {},
          // unexpected fields that must NOT survive
          connectedByUserId: "user-leak",
          integrationId: "int-leak",
        },
      ],
      edges: [],
    } as unknown as WorkflowDefinition;
    const out = sanitizeWorkflowDefinitionForExport(sneaky);
    expect(out.nodes[0]).not.toHaveProperty("connectedByUserId");
    expect(out.nodes[0]).not.toHaveProperty("integrationId");
    expect(JSON.stringify(out)).not.toMatch(/user-leak|int-leak/);
  });
});

describe("buildWorkflowExport — DTO", () => {
  const record = {
    id: "wf-1",
    accountId: "acct-1",
    createdByUserId: "user-secret-1",
    name: "My Workflow",
    state: "draft",
    draftDefinition: {
      nodes: [
        {
          id: "n1",
          kind: "action",
          provider: "slack",
          type: "post",
          position: { x: 0, y: 0 },
          config: { channel: "C1", token: (["xoxb", "leak", "1234567"].join("-")) },
        },
      ],
      edges: [],
    },
  } as unknown as WorkflowRecord;

  it("carries source / schemaVersion / exportedAt / redactionMarker + name + sanitized graph", () => {
    const out = buildWorkflowExport(record, "2026-06-07T00:00:00.000Z");
    expect(out.source).toBe(EXPORT_SOURCE);
    expect(out.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(out.exportedAt).toBe("2026-06-07T00:00:00.000Z");
    expect(out.redactionMarker).toBe(REDACTION_MARKER);
    expect(out.workflow.name).toBe("My Workflow");
    expect(out.workflow.definition.nodes[0]!.config.channel).toBe("C1");
    expect(out.workflow.definition.nodes[0]!.config.token).toBe(REDACTION_MARKER);
  });

  it("never leaks account/user ids or planted token (structural exclusion)", () => {
    const json = JSON.stringify(buildWorkflowExport(record, "2026-06-07T00:00:00.000Z"));
    expect(json).not.toMatch(/acct-1/);
    expect(json).not.toMatch(/user-secret-1/);
    expect(json).not.toMatch(/createdByUserId|accountId/);
    expect(json).not.toMatch((new RegExp(["xoxb", "leak"].join("-"))));
  });
});

describe("buildAccountWorkflowsExport — bulk DTO", () => {
  function rec(id: string, name: string, token: string): WorkflowRecord {
    return {
      id,
      accountId: "acct-bulk-1",
      createdByUserId: "user-bulk-secret",
      name,
      state: "draft",
      draftDefinition: {
        nodes: [
          {
            id: "n1",
            kind: "action",
            provider: "slack",
            type: "post",
            position: { x: 0, y: 0 },
            config: { channel: "C9", botToken: token, contact: "owner@acme.com" },
          },
        ],
        edges: [],
      },
    } as unknown as WorkflowRecord;
  }

  it("exports multiple workflows with metadata + workflowCount + accountId", () => {
    const r = buildAccountWorkflowsExport(
      "acct-bulk-1",
      [rec("wf-1", "First", (["xoxb", "leak", "A", "1234567"].join("-"))), rec("wf-2", "Second", (["xoxb", "leak", "B", "1234567"].join("-")))],
      "2026-06-07T00:00:00.000Z",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.export).toMatchObject({
      source: EXPORT_SOURCE,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: "2026-06-07T00:00:00.000Z",
      redactionMarker: REDACTION_MARKER,
      accountId: "acct-bulk-1",
      workflowCount: 2,
    });
    expect(r.export.workflows.map((w) => w.name)).toEqual(["First", "Second"]);
    // graph preserved per workflow
    expect(r.export.workflows[0]!.definition.nodes[0]!.config.channel).toBe("C9");
  });

  it("runs EVERY workflow through the sanitizer — no planted token/email across the bulk JSON", () => {
    const r = buildAccountWorkflowsExport(
      "acct-bulk-1",
      [rec("wf-1", "First", (["xoxb", "leak", "A", "1234567"].join("-"))), rec("wf-2", "Second", "ya29.leakB12345678")],
      "2026-06-07T00:00:00.000Z",
    );
    if (!r.ok) throw new Error("expected ok");
    const json = JSON.stringify(r.export);
    expect(json).not.toMatch((new RegExp(["xoxb", "leak", "A"].join("-"))));
    expect(json).not.toMatch(/ya29\.leakB/);
    expect(json).not.toMatch(/owner@acme\.com/);
    expect(json).not.toMatch(/user-bulk-secret/); // createdByUserId never included
    expect(r.export.workflows[0]!.definition.nodes[0]!.config.botToken).toBe(REDACTION_MARKER);
  });

  it("handles an empty account (zero workflows)", () => {
    const r = buildAccountWorkflowsExport("acct-bulk-1", [], "2026-06-07T00:00:00.000Z");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.export.workflowCount).toBe(0);
    expect(r.export.workflows).toEqual([]);
  });

  it("refuses over the per-export limit with a typed reason (no unbounded payload)", () => {
    const many = Array.from({ length: ACCOUNT_WORKFLOW_EXPORT_LIMIT + 1 }, (_, i) =>
      rec(`wf-${i}`, `W${i}`, (["xoxb", "x", "1234567"].join("-"))),
    );
    const r = buildAccountWorkflowsExport("acct-bulk-1", many, "2026-06-07T00:00:00.000Z");
    expect(r).toEqual({
      ok: false,
      reason: "too_many_workflows",
      count: ACCOUNT_WORKFLOW_EXPORT_LIMIT + 1,
      limit: ACCOUNT_WORKFLOW_EXPORT_LIMIT,
    });
  });

  it("allows exactly the limit", () => {
    const exact = Array.from({ length: ACCOUNT_WORKFLOW_EXPORT_LIMIT }, (_, i) =>
      rec(`wf-${i}`, `W${i}`, (["xoxb", "x", "1234567"].join("-"))),
    );
    const r = buildAccountWorkflowsExport("acct-bulk-1", exact, "2026-06-07T00:00:00.000Z");
    expect(r.ok).toBe(true);
  });
});
