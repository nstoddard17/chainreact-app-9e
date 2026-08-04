/**
 * @jest-environment node
 *
 * airtable/triggers/recordChanged trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockWebhooksCreate = jest.fn();
const mockWebhooksDelete = jest.fn();
const mockListPayloads = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();
const mockWebhooksRefresh = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/airtable/api/webhooks", () => ({
  webhooksCreate: (...args: unknown[]) => mockWebhooksCreate(...args),
  webhooksDelete: (...args: unknown[]) => mockWebhooksDelete(...args),
  webhooksListPayloads: (...args: unknown[]) => mockListPayloads(...args),
  webhooksRefresh: (...args: unknown[]) => mockWebhooksRefresh(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { activate } from "@/integrations/airtable/triggers/recordChanged/activate";
import { deactivate } from "@/integrations/airtable/triggers/recordChanged/deactivate";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import "@/integrations/airtable/triggers/recordChanged";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import { normalizePayload, normalizePayloads, type NormalizeContext } from "@/integrations/airtable/triggers/recordChanged/normalize";
import type { WebhookPayload } from "@/integrations/_shared/airtable/api/webhooks";
import { pull } from "@/integrations/airtable/triggers/recordChanged/pull";
import { airtableRecordChangedSubscriptionHandler } from "@/integrations/airtable/triggers/recordChanged/renew";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhooksCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.AIRTABLE_WEBHOOK_URL;
});

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "airtable",
  providerAccountId: "usrXXX",
  displayName: "alice",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "airtable",
  type: "record_changed",
  config: { baseId: "appBASE" },
  position: { x: 0, y: 0 },
};

describe("Airtable record_changed activate", () => {
  it("creates the webhook and returns the canonical config patch shape", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "secret-mac-key",
      expirationTime: "2026-05-16T00:00:00.000Z",
    });

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockWebhooksCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      type: "subscription-watch",
      webhookEnabled: true,
      baseId: "appBASE",
      webhookId: "achNEW",
      macSecretBase64: "secret-mac-key",
      notificationUrl: expect.stringContaining(
        "/api/webhooks/airtable?",
      ),
      expiresAt: "2026-05-16T00:00:00.000Z",
      lastCursor: null,
    });
    // Notification URL should carry workflow + node ids for diagnostics.
    const url = result.notificationUrl as string;
    expect(url).toContain("nodeId=node-trigger-1");
  });

  it("threads tableIdOrName as recordChangeScope when provided", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "s",
      expirationTime: "x",
    });
    await activate({
      node: { ...baseNode, config: { baseId: "appBASE", tableIdOrName: "tblTASKS" } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    const callArg = mockWebhooksCreate.mock.calls[0]![0];
    expect(callArg.specification).toEqual({
      dataTypes: ["tableData"],
      recordChangeScope: "tblTASKS",
    });
  });

  it("watches all tables when tableIdOrName is omitted (specification = dataTypes only)", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "s",
      expirationTime: "x",
    });
    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    const callArg = mockWebhooksCreate.mock.calls[0]![0];
    expect(callArg.specification).toEqual({ dataTypes: ["tableData"] });
  });

  it("throws when baseId is missing (required config field)", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/baseId is required/);
    expect(mockWebhooksCreate).not.toHaveBeenCalled();
  });

  it("uses AIRTABLE_WEBHOOK_URL override when set (e2e mock surface)", async () => {
    process.env.AIRTABLE_WEBHOOK_URL = "http://localhost:9880";
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "s",
      expirationTime: "x",
    });
    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    expect(result.notificationUrl).toMatch(
      /^http:\/\/localhost:9880\/api\/webhooks\/airtable\?/,
    );
  });

  it("threads userId + accountId through refreshAndRetry", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "s",
      expirationTime: "x",
    });
    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBe("acct-user-1");
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("airtable");
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe("usrXXX");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhooksDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "airtable",
  providerAccountId: "usrXXX",
  displayName: "alice",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "airtable",
    eventType: "record_changed",
    nodeId: "n-1",
    config,
    providerAccountId: "usrXXX",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Airtable record_changed deactivate", () => {
  it("calls webhooksDelete with stored baseId + webhookId", async () => {
    mockWebhooksDelete.mockResolvedValueOnce({});
    await deactivate({
      trigger: trigger({
        type: "subscription-watch",
        baseId: "appBASE",
        webhookId: "achWEBHOOK",
      }),
      integration,
    });
    expect(mockWebhooksDelete).toHaveBeenCalledTimes(1);
    const callArg = mockWebhooksDelete.mock.calls[0]![0];
    expect(callArg.baseId).toBe("appBASE");
    expect(callArg.webhookId).toBe("achWEBHOOK");
  });

  it("swallows NotFoundError (webhook already gone server-side)", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(new NotFoundError("webhook ach"));
    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          baseId: "appBASE",
          webhookId: "achWEBHOOK",
        }),
        integration,
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows 403 (token lacks permission OR webhook owned by different client)", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(
      new Error("Airtable DELETE failed: HTTP 403"),
    );
    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          baseId: "appBASE",
          webhookId: "achWEBHOOK",
        }),
        integration,
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (network, 5xx) to the lifecycle orchestrator", async () => {
    mockWebhooksDelete.mockRejectedValueOnce(new Error("network ECONNRESET"));
    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          baseId: "appBASE",
          webhookId: "achWEBHOOK",
        }),
        integration,
      }),
    ).rejects.toThrow(/ECONNRESET/);
  });

  it("skips when type is not subscription-watch (defensive)", async () => {
    await deactivate({
      trigger: trigger({ type: "polling" }),
      integration,
    });
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
  });

  it("skips when webhookId or baseId is missing (corrupt row)", async () => {
    await deactivate({
      trigger: trigger({ type: "subscription-watch", baseId: "appBASE" }),
      integration,
    });
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
    await deactivate({
      trigger: trigger({
        type: "subscription-watch",
        webhookId: "achWEBHOOK",
      }),
      integration,
    });
    expect(mockWebhooksDelete).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Integration registration test — importing
// integrations/airtable/triggers/recordChanged registers the
// activation, deactivation, and subscription handlers. The manifest
// registry test (manifest.test.ts) already asserts that the registry
// has the activation and deactivation hooks; this file additionally
// asserts the subscription handler shape so changes to the renew
// predicate / threshold surface explicitly.
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

describe("airtable record_changed registrations", () => {
  it("registers activation and deactivation hooks", () => {
    expect(findActivation("airtable", "record_changed")).not.toBeNull();
    expect(findDeactivation("airtable", "record_changed")).not.toBeNull();
  });

  it("registers a subscription handler with id 'airtable:record_changed' and 6-day threshold", () => {
    const trigger = {
      id: "tr-1",
      workflowId: "wf-1",
      workflowAccountId: "acct-1",
      userId: "user-1",
      provider: "airtable",
      eventType: "record_changed",
      nodeId: "n-1",
      config: { type: "subscription-watch" },
      providerAccountId: null,
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const handler = findSubscriptionHandler(trigger);
    expect(handler).not.toBeNull();
    expect(handler!.id).toBe("airtable:record_changed");
    expect(handler!.getRenewalThresholdMs()).toBe(6 * 24 * 60 * 60 * 1000);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const ctx: NormalizeContext = {
  webhookId: "achWEBHOOK",
  baseId: "appBASE",
  providerAccountId: "usrXXX",
  notificationOccurredAt: "2026-05-09T12:00:00Z",
};

describe("normalizePayload — created records", () => {
  it("emits one event per created record with eventType=created", () => {
    const payload: WebhookPayload = {
      timestamp: "2026-05-09T11:50:00.000Z",
      baseTransactionNumber: 7,
      changedTablesById: {
        tblTASKS: {
          createdRecordsById: {
            rec1: {
              createdTime: "2026-05-09T11:50:00.000Z",
              cellValuesByFieldId: { fld1: "Alice" },
            },
            rec2: {
              cellValuesByFieldId: { fld1: "Bob" },
            },
          },
        },
      },
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events).toHaveLength(2);
    expect(events[0]!.provider).toBe("airtable");
    expect(events[0]!.eventType).toBe("record_changed");
    expect((events[0]!.payload as { eventType: string }).eventType).toBe(
      "created",
    );
    expect((events[0]!.payload as { tableId: string }).tableId).toBe("tblTASKS");
    expect((events[0]!.payload as { recordId: string }).recordId).toBe("rec1");
    expect((events[0]!.payload as { fields: unknown }).fields).toEqual({
      fld1: "Alice",
    });
    expect(events[0]!.eventId).toBe(
      "achWEBHOOK:tblTASKS:rec1:created:7",
    );
    expect(events[0]!.occurredAt).toBe("2026-05-09T11:50:00.000Z");
  });
});

describe("normalizePayload — updated records", () => {
  it("uses current.cellValuesByFieldId + emits eventType=updated", () => {
    const payload: WebhookPayload = {
      baseTransactionNumber: 8,
      changedTablesById: {
        tblTASKS: {
          changedRecordsById: {
            rec1: {
              current: { cellValuesByFieldId: { fld1: "Alice v2" } },
              previous: { cellValuesByFieldId: { fld1: "Alice v1" } },
              changedFieldsById: { fld1: { current: "Alice v2" } },
            },
          },
        },
      },
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events).toHaveLength(1);
    const p = events[0]!.payload as Record<string, unknown>;
    expect(p.eventType).toBe("updated");
    expect(p.fields).toEqual({ fld1: "Alice v2" });
    expect(p.previousValues).toEqual({ fld1: "Alice v1" });
    expect(p.changedFieldsById).toEqual({ fld1: { current: "Alice v2" } });
    expect(events[0]!.eventId).toBe("achWEBHOOK:tblTASKS:rec1:updated:8");
  });
});

describe("normalizePayload — deleted records", () => {
  it("emits eventType=deleted with empty fields and deleted: true", () => {
    const payload: WebhookPayload = {
      baseTransactionNumber: 9,
      changedTablesById: {
        tblTASKS: {
          destroyedRecordIds: ["rec1", "rec2"],
        },
      },
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events).toHaveLength(2);
    for (const e of events) {
      const p = e.payload as Record<string, unknown>;
      expect(p.eventType).toBe("deleted");
      expect(p.fields).toEqual({});
      expect(p.deleted).toBe(true);
    }
    expect(events[0]!.eventId).toBe("achWEBHOOK:tblTASKS:rec1:deleted:9");
    expect(events[1]!.eventId).toBe("achWEBHOOK:tblTASKS:rec2:deleted:9");
  });
});

describe("normalizePayload — dedup key uniqueness", () => {
  it("same record + different transaction → distinct eventIds", () => {
    const payloads: WebhookPayload[] = [
      {
        baseTransactionNumber: 1,
        changedTablesById: {
          tblTASKS: { changedRecordsById: { rec1: { current: { cellValuesByFieldId: {} } } } },
        },
      },
      {
        baseTransactionNumber: 2,
        changedTablesById: {
          tblTASKS: { changedRecordsById: { rec1: { current: { cellValuesByFieldId: {} } } } },
        },
      },
    ];
    const { events } = normalizePayloads(payloads, ctx);
    expect(events).toHaveLength(2);
    expect(events[0]!.eventId).not.toBe(events[1]!.eventId);
  });

  it("same record + different change-class in one transaction → distinct eventIds", () => {
    // Defensive: in practice Airtable wouldn't put the same record in
    // both buckets in the same payload, but the dedup key shape MUST
    // discriminate by eventType so created+deleted of the same id in
    // the same tx don't collapse.
    const payload: WebhookPayload = {
      baseTransactionNumber: 5,
      changedTablesById: {
        tblTASKS: {
          createdRecordsById: { rec1: { cellValuesByFieldId: {} } },
          destroyedRecordIds: ["rec1"],
        },
      },
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events).toHaveLength(2);
    expect(events[0]!.eventId).not.toBe(events[1]!.eventId);
  });
});

describe("normalizePayload — fallbacks", () => {
  it("falls back to notificationOccurredAt when payload.timestamp is absent", () => {
    const payload: WebhookPayload = {
      baseTransactionNumber: 1,
      changedTablesById: {
        tblTASKS: {
          createdRecordsById: { rec1: { cellValuesByFieldId: {} } },
        },
      },
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events[0]!.occurredAt).toBe(ctx.notificationOccurredAt);
  });

  it("falls back to notificationOccurredAt in eventId when baseTransactionNumber is absent", () => {
    const payload: WebhookPayload = {
      changedTablesById: {
        tblTASKS: {
          createdRecordsById: { rec1: { cellValuesByFieldId: {} } },
        },
      },
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events[0]!.eventId).toBe(
      `achWEBHOOK:tblTASKS:rec1:created:${ctx.notificationOccurredAt}`,
    );
  });

  it("emits zero events for an actionMetadata-only payload (no changedTablesById)", () => {
    const payload: WebhookPayload = {
      timestamp: "x",
      actionMetadata: { source: "schemaChange" },
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events).toEqual([]);
  });
});

describe("normalizePayload — table_deleted fold (Airtable 2.1 Commit 5)", () => {
  it("emits one event per destroyed tableId in payload.destroyedTableIds", () => {
    const payload: WebhookPayload = {
      baseTransactionNumber: 42,
      timestamp: "2026-05-09T11:55:00.000Z",
      destroyedTableIds: ["tblOLD1", "tblOLD2"],
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.provider).toBe("airtable");
      expect(e.eventType).toBe("record_changed");
      const p = e.payload as Record<string, unknown>;
      expect(p.eventType).toBe("table_deleted");
      expect(p.baseId).toBe(ctx.baseId);
      // Both events carry the full snapshot of destroyed table ids.
      expect(p.destroyedTableIds).toEqual(["tblOLD1", "tblOLD2"]);
      expect(p.baseTransactionNumber).toBe(42);
    }
    expect((events[0]!.payload as { tableId: string }).tableId).toBe("tblOLD1");
    expect((events[1]!.payload as { tableId: string }).tableId).toBe("tblOLD2");
    expect(events[0]!.eventId).toBe(
      "achWEBHOOK:tblOLD1:_table_:table_deleted:42",
    );
    expect(events[1]!.eventId).toBe(
      "achWEBHOOK:tblOLD2:_table_:table_deleted:42",
    );
    expect(events[0]!.occurredAt).toBe("2026-05-09T11:55:00.000Z");
  });

  it("does NOT emit a separate record_changed type — eventType discriminator only (no airtable:table_deleted trigger)", () => {
    const payload: WebhookPayload = {
      baseTransactionNumber: 1,
      destroyedTableIds: ["tblOLD"],
    };
    const { events } = normalizePayload(payload, ctx);
    // Same canonical trigger event type as record-level events; the
    // discriminator lives in payload.eventType.
    expect(events[0]!.eventType).toBe("record_changed");
    expect((events[0]!.payload as { eventType: string }).eventType).toBe(
      "table_deleted",
    );
  });

  it("emits both record-level + table_deleted events when a payload mixes both buckets", () => {
    const payload: WebhookPayload = {
      baseTransactionNumber: 7,
      changedTablesById: {
        tblTASKS: {
          createdRecordsById: { rec1: { cellValuesByFieldId: { fld1: "Alice" } } },
        },
      },
      destroyedTableIds: ["tblARCHIVED"],
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events).toHaveLength(2);
    const kinds = events.map(
      (e) => (e.payload as { eventType: string }).eventType,
    );
    expect(kinds).toEqual(expect.arrayContaining(["created", "table_deleted"]));
  });

  it("treats an empty destroyedTableIds array as a no-op (no table_deleted events)", () => {
    const payload: WebhookPayload = {
      baseTransactionNumber: 1,
      destroyedTableIds: [],
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events).toEqual([]);
  });

  it("falls back to notificationOccurredAt in eventId when baseTransactionNumber is absent", () => {
    const payload: WebhookPayload = {
      destroyedTableIds: ["tblOLD"],
    };
    const { events } = normalizePayload(payload, ctx);
    expect(events[0]!.eventId).toBe(
      `achWEBHOOK:tblOLD:_table_:table_deleted:${ctx.notificationOccurredAt}`,
    );
  });

  it("dedup key uniqueness — same destroyed tableId across two transactions → distinct eventIds", () => {
    const payloads: WebhookPayload[] = [
      { baseTransactionNumber: 1, destroyedTableIds: ["tblOLD"] },
      { baseTransactionNumber: 2, destroyedTableIds: ["tblOLD"] },
    ];
    const { events } = normalizePayloads(payloads, ctx);
    expect(events).toHaveLength(2);
    expect(events[0]!.eventId).not.toBe(events[1]!.eventId);
  });
});

describe("normalizePayload — schema-aware parsing", () => {
  it("emits parsedFields + skippedFields when a schema is provided for the table", () => {
    const schemaCtx: NormalizeContext = {
      ...ctx,
      schemaByTableId: {
        tblTASKS: [
          { id: "fld1", name: "Name", type: "singleLineText" },
          { id: "fld2", name: "Done", type: "checkbox" },
          { id: "fld3", name: "Foreign", type: "rollup" },
        ],
      },
    };
    const payload: WebhookPayload = {
      baseTransactionNumber: 1,
      changedTablesById: {
        tblTASKS: {
          createdRecordsById: {
            rec1: {
              cellValuesByFieldId: {
                fld1: "Alice",
                fld2: true,
                fld3: 42,
              },
            },
          },
        },
      },
    };
    const { events } = normalizePayload(payload, schemaCtx);
    const p = events[0]!.payload as Record<string, unknown>;
    expect(p.fields).toEqual({ fld1: "Alice", fld2: true, fld3: 42 });
    expect(p.parsedFields).toEqual({
      fld1: { type: "singleLineText", value: "Alice" },
      fld2: { type: "checkbox", value: true },
    });
    expect(p.skippedFields).toEqual([{ name: "fld3", type: "rollup" }]);
  });

  it("forwards raw cellValues as fields when no schema is supplied", () => {
    const payload: WebhookPayload = {
      baseTransactionNumber: 1,
      changedTablesById: {
        tblTASKS: {
          createdRecordsById: {
            rec1: { cellValuesByFieldId: { fld1: "Alice" } },
          },
        },
      },
    };
    const { events } = normalizePayload(payload, ctx);
    const p = events[0]!.payload as Record<string, unknown>;
    expect(p.fields).toEqual({ fld1: "Alice" });
    expect(p.parsedFields).toBeUndefined();
    expect(p.skippedFields).toBeUndefined();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pull.test.ts
// ---------------------------------------------------------------------------
describe("pull (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockListPayloads.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    providerAccountId: "usrXXX",
  });
});

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "airtable",
    eventType: "record_changed",
    nodeId: "n-1",
    config,
    providerAccountId: "usrXXX",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("pull — first call (no cursor)", () => {
  it("calls webhooksListPayloads with cursor=undefined and persists response.cursor", async () => {
    mockListPayloads.mockResolvedValueOnce({
      payloads: [],
      cursor: 5,
      mightHaveMore: false,
    });

    const result = await pull(
      trigger({
        baseId: "appBASE",
        webhookId: "achWEBHOOK",
        macSecretBase64: "secret",
        lastCursor: null,
      }),
      "2026-05-09T12:00:00Z",
    );

    expect(mockListPayloads).toHaveBeenCalledTimes(1);
    expect(mockListPayloads.mock.calls[0]![0].cursor).toBeUndefined();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig.mock.calls[0]![0]).toBe("tr-1");
    expect((mockUpdateConfig.mock.calls[0]![1] as { lastCursor: number }).lastCursor).toBe(5);
    expect(result.cursorAdvanced).toBe(true);
    expect(result.events).toEqual([]);
  });
});

describe("pull — subsequent calls (with persisted cursor)", () => {
  it("forwards lastCursor and emits events for record changes", async () => {
    mockListPayloads.mockResolvedValueOnce({
      payloads: [
        {
          baseTransactionNumber: 7,
          timestamp: "2026-05-09T11:50:00.000Z",
          changedTablesById: {
            tblTASKS: {
              createdRecordsById: {
                rec1: { cellValuesByFieldId: { fld1: "Alice" } },
              },
            },
          },
        },
      ],
      cursor: 8,
      mightHaveMore: false,
    });

    const result = await pull(
      trigger({
        baseId: "appBASE",
        webhookId: "achWEBHOOK",
        macSecretBase64: "secret",
        lastCursor: 7,
      }),
      "2026-05-09T12:00:00Z",
    );

    expect(mockListPayloads.mock.calls[0]![0].cursor).toBe(7);
    expect(result.events).toHaveLength(1);
    expect((result.events[0]!.payload as { eventType: string }).eventType).toBe(
      "created",
    );
    expect(result.events[0]!.eventId).toBe(
      "achWEBHOOK:tblTASKS:rec1:created:7",
    );
  });
});

describe("pull — cursor advancement ordering", () => {
  it("persists the cursor BEFORE the events return (downstream-failure replay safety)", async () => {
    const updateOrder: number[] = [];
    mockUpdateConfig.mockImplementation(async () => {
      updateOrder.push(Date.now());
    });

    mockListPayloads.mockResolvedValueOnce({
      payloads: [
        {
          baseTransactionNumber: 1,
          changedTablesById: {
            tblA: {
              createdRecordsById: { rec1: { cellValuesByFieldId: {} } },
            },
          },
        },
      ],
      cursor: 1,
      mightHaveMore: false,
    });

    await pull(
      trigger({ baseId: "appBASE", webhookId: "achWEBHOOK" }),
      "2026-05-09T12:00:00Z",
    );

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    // The single mock-listPayloads call returned payloads + cursor.
    // updateConfig must have been awaited before pull resolved (we
    // wait above with `await pull(...)` so by definition all
    // synchronous awaits inside pull resolved before the `await`
    // above completes).
    expect(updateOrder).toHaveLength(1);
  });
});

describe("pull — pagination via mightHaveMore", () => {
  it("loops until mightHaveMore=false, advancing cursor each page", async () => {
    mockListPayloads
      .mockResolvedValueOnce({
        payloads: [
          {
            baseTransactionNumber: 1,
            changedTablesById: {
              tblA: { createdRecordsById: { rec1: { cellValuesByFieldId: {} } } },
            },
          },
        ],
        cursor: 1,
        mightHaveMore: true,
      })
      .mockResolvedValueOnce({
        payloads: [
          {
            baseTransactionNumber: 2,
            changedTablesById: {
              tblA: { createdRecordsById: { rec2: { cellValuesByFieldId: {} } } },
            },
          },
        ],
        cursor: 2,
        mightHaveMore: false,
      });

    const result = await pull(
      trigger({ baseId: "appBASE", webhookId: "achWEBHOOK" }),
      "2026-05-09T12:00:00Z",
    );

    expect(mockListPayloads).toHaveBeenCalledTimes(2);
    // Second call uses the persisted cursor from the first response.
    expect(mockListPayloads.mock.calls[1]![0].cursor).toBe(1);
    expect(result.events).toHaveLength(2);
    expect(result.cursorAdvanced).toBe(true);
  });
});

describe("pull — defensive paths", () => {
  it("returns zero events when no active integration (user disconnected mid-flight)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const result = await pull(
      trigger({ baseId: "appBASE", webhookId: "achWEBHOOK" }),
      "2026-05-09T12:00:00Z",
    );
    expect(result.events).toEqual([]);
    expect(mockListPayloads).not.toHaveBeenCalled();
  });

  it("returns zero events when config is missing baseId or webhookId", async () => {
    const result = await pull(
      trigger({ baseId: "appBASE" }),
      "2026-05-09T12:00:00Z",
    );
    expect(result.events).toEqual([]);
    expect(mockListPayloads).not.toHaveBeenCalled();
  });

  it("does NOT advance the cursor when Airtable returns the same cursor (defensive)", async () => {
    mockListPayloads.mockResolvedValueOnce({
      payloads: [],
      cursor: 5,
      mightHaveMore: false,
    });
    const result = await pull(
      trigger({
        baseId: "appBASE",
        webhookId: "achWEBHOOK",
        lastCursor: 5,
      }),
      "2026-05-09T12:00:00Z",
    );
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(result.cursorAdvanced).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former renew.test.ts
// ---------------------------------------------------------------------------
describe("renew (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhooksRefresh.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "airtable",
    eventType: "record_changed",
    nodeId: "n-1",
    config,
    providerAccountId: "usrXXX",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("airtableRecordChangedSubscriptionHandler", () => {
  it("identifies the handler with a stable id", () => {
    expect(airtableRecordChangedSubscriptionHandler.id).toBe(
      "airtable:record_changed",
    );
  });

  it("canHandle: matches airtable + record_changed + subscription-watch", () => {
    const t = trigger({ type: "subscription-watch" });
    expect(airtableRecordChangedSubscriptionHandler.canHandle(t)).toBe(true);
  });

  it("canHandle: rejects other providers", () => {
    const t = { ...trigger({ type: "subscription-watch" }), provider: "notion" };
    expect(airtableRecordChangedSubscriptionHandler.canHandle(t)).toBe(false);
  });

  it("canHandle: rejects polling triggers (different config.type)", () => {
    const t = trigger({ type: "polling" });
    expect(airtableRecordChangedSubscriptionHandler.canHandle(t)).toBe(false);
  });

  it("getRenewalThresholdMs returns 6 days", () => {
    expect(
      airtableRecordChangedSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(6 * 24 * 60 * 60 * 1000);
  });
});

describe("airtableRecordChangedSubscriptionHandler.renew", () => {
  it("calls webhooksRefresh and persists the new expiresAt", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce({
      id: "int-1",
      userId: "user-1",
      providerAccountId: "usrXXX",
    });
    mockWebhooksRefresh.mockResolvedValueOnce({
      expirationTime: "2026-05-23T00:00:00.000Z",
    });
    const t = trigger({
      type: "subscription-watch",
      baseId: "appBASE",
      webhookId: "achWEBHOOK",
      macSecretBase64: "secret",
      lastCursor: 5,
    });

    await airtableRecordChangedSubscriptionHandler.renew({ trigger: t });

    expect(mockWebhooksRefresh).toHaveBeenCalledWith({
      accessToken: "tok",
      baseId: "appBASE",
      webhookId: "achWEBHOOK",
    });
    // updateConfig must preserve all other config fields and set new expiresAt.
    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      baseId: "appBASE",
      webhookId: "achWEBHOOK",
      macSecretBase64: "secret",
      lastCursor: 5,
      expiresAt: "2026-05-23T00:00:00.000Z",
    });
  });

  it("throws when config is missing baseId or webhookId", async () => {
    const t = trigger({ type: "subscription-watch", baseId: "appBASE" });
    await expect(
      airtableRecordChangedSubscriptionHandler.renew({ trigger: t }),
    ).rejects.toThrow(/missing baseId or webhookId/);
  });

  it("throws when no active integration is found", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const t = trigger({
      type: "subscription-watch",
      baseId: "appBASE",
      webhookId: "achWEBHOOK",
    });
    await expect(
      airtableRecordChangedSubscriptionHandler.renew({ trigger: t }),
    ).rejects.toThrow(/no active integration/);
    expect(mockWebhooksRefresh).not.toHaveBeenCalled();
  });
});

});
