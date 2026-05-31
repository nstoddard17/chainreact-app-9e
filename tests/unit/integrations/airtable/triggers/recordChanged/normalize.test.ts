/**
 * @jest-environment node
 */
import {
  normalizePayload,
  normalizePayloads,
  type NormalizeContext,
} from "@/integrations/airtable/triggers/recordChanged/normalize";
import type { WebhookPayload } from "@/integrations/_shared/airtable/api/webhooks";

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
