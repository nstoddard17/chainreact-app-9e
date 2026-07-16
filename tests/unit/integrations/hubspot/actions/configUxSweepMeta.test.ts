/**
 * CONFIG-UX sweep (Group B — hubspot) meta guards.
 *
 * Pins the metadata-only builder-UX changes against the RUNTIME schemas
 * so meta and wire contract can't drift:
 *
 *   1. get-family (contacts/companies/deals/tickets/products/line_items):
 *      `after` + `properties` live in the Advanced tab, `limit` pre-fills
 *      25, and `filterValue` is revealed only while `filterProperty` is
 *      set (visibleWhen references a REAL sibling with no chained
 *      visibleWhen). get_owners: `after` advanced, `limit` pre-fills 100
 *      (the wrapper default its description already promised).
 *   2. create/update_deal `closedate` is `datetime-utc` — the editor
 *      commits an ISO string, which the runtime `z.string()` accepts
 *      verbatim (round-trip proven below).
 *   3. create/update_product `hs_recurring_billing_period` is a
 *      combobox with static ISO-8601-duration options + allowManualEntry
 *      (capability preserved: any duration string still commits).
 *   4. SCREAMING_SNAKE select labels became plain English while the
 *      committed VALUES stay the HubSpot wire enums — every option value
 *      is parsed through the runtime schema.
 *   5. Meta `defaultValue` mirrors the schema's Zod default exactly for
 *      task status/priority/type, call status, meeting outcome.
 */
import { hubspotGetContactsMeta } from "@/integrations/hubspot/actions/meta/getContacts.meta";
import { hubspotGetCompaniesMeta } from "@/integrations/hubspot/actions/meta/getCompanies.meta";
import { hubspotGetDealsMeta } from "@/integrations/hubspot/actions/meta/getDeals.meta";
import { hubspotGetTicketsMeta } from "@/integrations/hubspot/actions/meta/getTickets.meta";
import { hubspotGetProductsMeta } from "@/integrations/hubspot/actions/meta/getProducts.meta";
import { hubspotGetLineItemsMeta } from "@/integrations/hubspot/actions/meta/getLineItems.meta";
import { hubspotGetOwnersMeta } from "@/integrations/hubspot/actions/meta/getOwners.meta";
import { hubspotCreateDealMeta } from "@/integrations/hubspot/actions/meta/createDeal.meta";
import { hubspotUpdateDealMeta } from "@/integrations/hubspot/actions/meta/updateDeal.meta";
import { hubspotCreateProductMeta } from "@/integrations/hubspot/actions/meta/createProduct.meta";
import { hubspotUpdateProductMeta } from "@/integrations/hubspot/actions/meta/updateProduct.meta";
import { hubspotCreateTaskMeta } from "@/integrations/hubspot/actions/meta/createTask.meta";
import { hubspotCreateCallMeta } from "@/integrations/hubspot/actions/meta/createCall.meta";
import { hubspotCreateMeetingMeta } from "@/integrations/hubspot/actions/meta/createMeeting.meta";
import { hubspotCreateTicketMeta } from "@/integrations/hubspot/actions/meta/createTicket.meta";
import { hubspotUpdateTicketMeta } from "@/integrations/hubspot/actions/meta/updateTicket.meta";
import { hubspotCreateContactMeta } from "@/integrations/hubspot/actions/meta/createContact.meta";
import { hubspotCreateCompanyMeta } from "@/integrations/hubspot/actions/meta/createCompany.meta";
import { CreateDealConfigSchema } from "@/integrations/hubspot/actions/createDeal.schema";
import { UpdateDealConfigSchema } from "@/integrations/hubspot/actions/updateDeal.schema";
import { CreateProductConfigSchema } from "@/integrations/hubspot/actions/createProduct.schema";
import { UpdateProductConfigSchema } from "@/integrations/hubspot/actions/updateProduct.schema";
import { CreateTaskConfigSchema } from "@/integrations/hubspot/actions/createTask.schema";
import { CreateCallConfigSchema } from "@/integrations/hubspot/actions/createCall.schema";
import { CreateMeetingConfigSchema } from "@/integrations/hubspot/actions/createMeeting.schema";
import { CreateTicketConfigSchema } from "@/integrations/hubspot/actions/createTicket.schema";
import { UpdateTicketConfigSchema } from "@/integrations/hubspot/actions/updateTicket.schema";
import { CreateContactConfigSchema } from "@/integrations/hubspot/actions/createContact.schema";
import { CreateCompanyConfigSchema } from "@/integrations/hubspot/actions/createCompany.schema";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";

function field(meta: ActionMeta, name: string): FieldMeta {
  const f = meta.fields.find((x) => x.name === name);
  if (!f) throw new Error(`${meta.key} has no field '${name}'`);
  return f;
}

describe("hubspot get-family Advanced-tab + visibleWhen sweep", () => {
  const searchFamily: ReadonlyArray<[ActionMeta, string]> = [
    [hubspotGetContactsMeta, "contacts"],
    [hubspotGetCompaniesMeta, "companies"],
    [hubspotGetDealsMeta, "deals"],
    [hubspotGetTicketsMeta, "tickets"],
    [hubspotGetProductsMeta, "products"],
    [hubspotGetLineItemsMeta, "line items"],
  ];

  it.each(searchFamily.map(([m]) => [m.key, m] as const))(
    "%s: after + properties advanced, limit defaults to 25, filterValue gated on filterProperty",
    (_key, meta) => {
      expect(field(meta, "after").advanced).toBe(true);
      expect(field(meta, "properties").advanced).toBe(true);
      expect(field(meta, "limit").defaultValue).toBe(25);

      const filterValue = field(meta, "filterValue");
      expect(filterValue.visibleWhen).toEqual({
        field: "filterProperty",
        valueTruthy: true,
      });
      // Controller is a REAL sibling and does not chain visibleWhen.
      const controller = field(meta, "filterProperty");
      expect(controller.visibleWhen).toBeUndefined();
      // Both stay optional — required-when-visible does not apply here.
      expect(filterValue.required).toBe(false);
      expect(controller.required).toBe(false);
    },
  );

  it("get_owners: after advanced, limit pre-fills the wrapper default of 100", () => {
    expect(field(hubspotGetOwnersMeta, "after").advanced).toBe(true);
    expect(field(hubspotGetOwnersMeta, "limit").defaultValue).toBe(100);
  });
});

describe("create/update_deal closedate — datetime-utc commits a runtime-valid ISO string", () => {
  const ISO = "2026-12-31T00:00:00Z";

  it("meta field type is datetime-utc on both metas", () => {
    expect(field(hubspotCreateDealMeta, "closedate").type).toBe("datetime-utc");
    expect(field(hubspotUpdateDealMeta, "closedate").type).toBe("datetime-utc");
  });

  it("round-trip: the committed ISO string parses verbatim through the runtime schemas", () => {
    const created = CreateDealConfigSchema.parse({
      dealname: "Acme — Enterprise Deal Q2",
      dealstage: "appointmentscheduled",
      closedate: ISO,
    });
    expect(created.closedate).toBe(ISO);

    const updated = UpdateDealConfigSchema.parse({
      dealId: "12345",
      closedate: ISO,
    });
    expect(updated.closedate).toBe(ISO);
  });

  it("pasted millisecond-epoch strings stay runtime-valid (z.string — no format narrowing)", () => {
    const epoch = "1798675200000";
    expect(
      CreateDealConfigSchema.parse({
        dealname: "d",
        dealstage: "s",
        closedate: epoch,
      }).closedate,
    ).toBe(epoch);
  });
});

describe("create/update_product hs_recurring_billing_period — combobox + manual entry", () => {
  const EXPECTED_OPTIONS = ["P1M", "P3M", "P6M", "P1Y"];

  it.each([
    [hubspotCreateProductMeta.key, hubspotCreateProductMeta],
    [hubspotUpdateProductMeta.key, hubspotUpdateProductMeta],
  ] as const)("%s: combobox with ISO-duration options and allowManualEntry", (_key, meta) => {
    const f = field(meta, "hs_recurring_billing_period");
    expect(f.type).toBe("combobox");
    expect(f.allowManualEntry).toBe(true);
    expect(f.options!.map((o) => o.value)).toEqual(EXPECTED_OPTIONS);
  });

  it("every option value AND a manual duration commit through the runtime schemas", () => {
    for (const value of [...EXPECTED_OPTIONS, "P2M"]) {
      expect(
        CreateProductConfigSchema.parse({
          name: "Pro Subscription",
          hs_recurring_billing_period: value,
        }).hs_recurring_billing_period,
      ).toBe(value);
      expect(
        UpdateProductConfigSchema.parse({
          productId: "12345",
          hs_recurring_billing_period: value,
        }).hs_recurring_billing_period,
      ).toBe(value);
    }
  });
});

describe("plain-English select labels — HubSpot wire-enum VALUES preserved", () => {
  const cases: ReadonlyArray<{
    meta: ActionMeta;
    fieldName: string;
    values: string[];
    parse: (value: string) => unknown;
  }> = [
    {
      meta: hubspotCreateTaskMeta,
      fieldName: "hs_task_status",
      values: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "WAITING", "DEFERRED"],
      parse: (v) =>
        CreateTaskConfigSchema.parse({ hs_task_subject: "s", hs_task_status: v }),
    },
    {
      meta: hubspotCreateTaskMeta,
      fieldName: "hs_task_priority",
      values: ["LOW", "MEDIUM", "HIGH"],
      parse: (v) =>
        CreateTaskConfigSchema.parse({ hs_task_subject: "s", hs_task_priority: v }),
    },
    {
      meta: hubspotCreateTaskMeta,
      fieldName: "hs_task_type",
      values: ["TODO", "CALL", "EMAIL"],
      parse: (v) =>
        CreateTaskConfigSchema.parse({ hs_task_subject: "s", hs_task_type: v }),
    },
    {
      meta: hubspotCreateCallMeta,
      fieldName: "hs_call_direction",
      values: ["INBOUND", "OUTBOUND"],
      parse: (v) => CreateCallConfigSchema.parse({ hs_call_direction: v }),
    },
    {
      meta: hubspotCreateCallMeta,
      fieldName: "hs_call_status",
      values: [
        "BUSY",
        "CANCELED",
        "COMPLETED",
        "CONNECTING",
        "FAILED",
        "IN_PROGRESS",
        "NO_ANSWER",
        "QUEUED",
        "RINGING",
      ],
      parse: (v) => CreateCallConfigSchema.parse({ hs_call_status: v }),
    },
    {
      meta: hubspotCreateMeetingMeta,
      fieldName: "hs_meeting_outcome",
      values: ["SCHEDULED", "COMPLETED", "RESCHEDULED", "NO_SHOW", "CANCELED"],
      parse: (v) =>
        CreateMeetingConfigSchema.parse({
          hs_meeting_title: "t",
          hs_meeting_outcome: v,
        }),
    },
    {
      meta: hubspotCreateTicketMeta,
      fieldName: "hs_ticket_priority",
      values: ["LOW", "MEDIUM", "HIGH"],
      parse: (v) =>
        CreateTicketConfigSchema.parse({
          subject: "s",
          hs_pipeline: "0",
          hs_pipeline_stage: "1",
          hs_ticket_priority: v,
        }),
    },
    {
      meta: hubspotUpdateTicketMeta,
      fieldName: "hs_ticket_priority",
      values: ["LOW", "MEDIUM", "HIGH"],
      parse: (v) =>
        UpdateTicketConfigSchema.parse({ ticketId: "1", hs_ticket_priority: v }),
    },
    {
      meta: hubspotCreateContactMeta,
      fieldName: "duplicateHandling",
      values: ["fail", "update", "skip"],
      parse: (v) =>
        CreateContactConfigSchema.parse({
          email: "a@example.com",
          duplicateHandling: v,
        }),
    },
    {
      meta: hubspotCreateCompanyMeta,
      fieldName: "duplicateHandling",
      values: ["fail", "update", "skip"],
      parse: (v) =>
        CreateCompanyConfigSchema.parse({ name: "Acme", duplicateHandling: v }),
    },
  ];

  it.each(cases.map((c) => [`${c.meta.key}.${c.fieldName}`, c] as const))(
    "%s: option values equal the runtime enum and each parses; labels are no longer raw enums",
    (_name, c) => {
      const f = field(c.meta, c.fieldName);
      expect(f.options!.map((o) => o.value)).toEqual(c.values);
      for (const v of c.values) {
        expect(() => c.parse(v)).not.toThrow();
      }
      // No label is a raw SCREAMING_SNAKE / raw-lowercase wire value.
      for (const o of f.options!) {
        expect(o.label).not.toMatch(/^[A-Z][A-Z_]+$/);
        expect(o.label).not.toBe(o.value);
      }
    },
  );
});

describe("meta defaultValue mirrors the runtime Zod default exactly", () => {
  it("create_task status/priority/type", () => {
    const parsed = CreateTaskConfigSchema.parse({ hs_task_subject: "s" });
    expect(field(hubspotCreateTaskMeta, "hs_task_status").defaultValue).toBe(
      parsed.hs_task_status,
    );
    expect(field(hubspotCreateTaskMeta, "hs_task_priority").defaultValue).toBe(
      parsed.hs_task_priority,
    );
    expect(field(hubspotCreateTaskMeta, "hs_task_type").defaultValue).toBe(
      parsed.hs_task_type,
    );
  });

  it("create_call status (direction stays default-free — author's choice)", () => {
    const parsed = CreateCallConfigSchema.parse({});
    expect(field(hubspotCreateCallMeta, "hs_call_status").defaultValue).toBe(
      parsed.hs_call_status,
    );
    expect(
      field(hubspotCreateCallMeta, "hs_call_direction").defaultValue,
    ).toBeUndefined();
  });

  it("create_meeting outcome", () => {
    const parsed = CreateMeetingConfigSchema.parse({ hs_meeting_title: "t" });
    expect(
      field(hubspotCreateMeetingMeta, "hs_meeting_outcome").defaultValue,
    ).toBe(parsed.hs_meeting_outcome);
  });

  it("ticket priority stays default-free on create AND update (Q11 — author decides)", () => {
    expect(
      field(hubspotCreateTicketMeta, "hs_ticket_priority").defaultValue,
    ).toBeUndefined();
    expect(
      field(hubspotUpdateTicketMeta, "hs_ticket_priority").defaultValue,
    ).toBeUndefined();
  });
});

describe("create_task reminders — advanced escape hatch", () => {
  it("hs_task_reminders is advanced and stays optional text", () => {
    const f = field(hubspotCreateTaskMeta, "hs_task_reminders");
    expect(f.advanced).toBe(true);
    expect(f.type).toBe("text");
    expect(f.required).toBe(false);
  });
});
