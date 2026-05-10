/**
 * @jest-environment node
 *
 * Tests for the remaining Mailchimp Commit 3 action handlers:
 *   - create_segment (static + saved modes via discriminated union)
 *   - create_audience (CAN-SPAM compliance fields)
 *   - create_custom_event (lowercase event_name regex)
 *   - add_note (≤1000 char limit)
 *
 * Verifies, per handler:
 *   - Schema strict, required fields enforced.
 *   - Wrapper called with the right argument mapping.
 *   - Output shape stable.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSegmentCreate = jest.fn();
const mockListCreate = jest.fn();
const mockMemberAddEvent = jest.fn();
const mockMemberAddNote = jest.fn();
const mockResolveDc = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/mailchimp/api/segments", () => ({
  segmentCreate: (...a: unknown[]) => mockSegmentCreate(...a),
}));
jest.mock("@/integrations/_shared/mailchimp/api/lists", () => ({
  listCreate: (...a: unknown[]) => mockListCreate(...a),
}));
jest.mock("@/integrations/_shared/mailchimp/api/members", () => ({
  memberAddEvent: (...a: unknown[]) => mockMemberAddEvent(...a),
  memberAddNote: (...a: unknown[]) => mockMemberAddNote(...a),
}));
jest.mock("@/integrations/mailchimp/actions/_resolveDc", () => ({
  resolveDc: (...a: unknown[]) => mockResolveDc(...a),
}));

import { createSegment } from "@/integrations/mailchimp/actions/createSegment";
import { CreateSegmentConfigSchema } from "@/integrations/mailchimp/actions/createSegment.schema";
import { createAudience } from "@/integrations/mailchimp/actions/createAudience";
import { CreateAudienceConfigSchema } from "@/integrations/mailchimp/actions/createAudience.schema";
import { createCustomEvent } from "@/integrations/mailchimp/actions/createCustomEvent";
import { CreateCustomEventConfigSchema } from "@/integrations/mailchimp/actions/createCustomEvent.schema";
import { addNote } from "@/integrations/mailchimp/actions/addNote";
import { AddNoteConfigSchema } from "@/integrations/mailchimp/actions/addNote.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSegmentCreate.mockReset();
  mockListCreate.mockReset();
  mockMemberAddEvent.mockReset();
  mockMemberAddNote.mockReset();
  mockResolveDc.mockReset();
  mockResolveDc.mockResolvedValue({ dc: "us21", accountId: "mc_account_xyz" });
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "mailchimp",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-10T12:00:00Z",
    accountId: "mc_account_xyz",
    payload: {},
  };
}

function makeInput(config: Record<string, unknown>) {
  return {
    workflowId: "w1",
    userId: "u1",
    runId: "r1",
    nodeId: "n1",
    config,
    triggerEvent: trigger(),
  };
}

// ─── create_segment ─────────────────────────────────────────────────────────

describe("create_segment", () => {
  beforeEach(() => {
    mockSegmentCreate.mockResolvedValue({
      id: 42,
      name: "VIPs",
      member_count: 2,
      created_at: "2026-01-01T00:00:00+00:00",
    });
  });

  it("schema discriminated by mode — static requires no conditions", () => {
    expect(() =>
      CreateSegmentConfigSchema.parse({
        audience_id: "list_1",
        name: "X",
        mode: "static",
      }),
    ).not.toThrow();
  });

  it("schema discriminated by mode — saved requires conditions (≥1)", () => {
    expect(() =>
      CreateSegmentConfigSchema.parse({
        audience_id: "list_1",
        name: "X",
        mode: "saved",
        // conditions omitted
      }),
    ).toThrow();
    expect(() =>
      CreateSegmentConfigSchema.parse({
        audience_id: "list_1",
        name: "X",
        mode: "saved",
        conditions: [],
      }),
    ).toThrow();
  });

  it("static mode calls segmentCreate with staticSegment array", async () => {
    await createSegment(
      makeInput({
        audience_id: "list_1",
        name: "VIPs",
        mode: "static",
        static_emails: ["a@b.com", "c@d.com"],
      }),
    );
    expect(mockSegmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceId: "list_1",
        name: "VIPs",
        staticSegment: ["a@b.com", "c@d.com"],
      }),
    );
  });

  it("saved mode calls segmentCreate with conditions + match", async () => {
    await createSegment(
      makeInput({
        audience_id: "list_1",
        name: "EN",
        mode: "saved",
        conditions: [{ field: "language", op: "is", value: "en" }],
        match: "all",
      }),
    );
    expect(mockSegmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: [{ field: "language", op: "is", value: "en" }],
        match: "all",
      }),
    );
  });

  it("output includes mode + segmentId as string", async () => {
    const result = await createSegment(
      makeInput({
        audience_id: "list_1",
        name: "VIPs",
        mode: "static",
      }),
    );
    expect(result.output.segmentId).toBe("42");
    expect(result.output.mode).toBe("static");
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      CreateSegmentConfigSchema.parse({
        audience_id: "list_1",
        name: "X",
        mode: "static",
        unknown_field: 1,
      }),
    ).toThrow();
  });
});

// ─── create_audience ────────────────────────────────────────────────────────

describe("create_audience", () => {
  const REQUIRED = {
    name: "Acme List",
    permission_reminder: "You signed up on acme.com",
    email_type_option: false,
    contact: {
      company: "Acme",
      address1: "123 Main St",
      city: "SF",
      state: "CA",
      zip: "94102",
      country: "US",
    },
    campaign_defaults: {
      from_name: "Acme",
      from_email: "hi@acme.com",
    },
  };

  beforeEach(() => {
    mockListCreate.mockResolvedValue({
      id: "abc",
      name: REQUIRED.name,
      web_id: 99,
      date_created: "2026-01-01T00:00:00+00:00",
      stats: { member_count: 0 },
    });
  });

  it("schema requires compliance fields (permission_reminder + contact + campaign_defaults)", () => {
    expect(() => CreateAudienceConfigSchema.parse({ name: "X" })).toThrow();
    expect(() =>
      CreateAudienceConfigSchema.parse({
        name: "X",
        permission_reminder: "test",
        email_type_option: false,
        contact: REQUIRED.contact,
        // campaign_defaults omitted
      }),
    ).toThrow();
  });

  it("schema requires email_type_option to be explicit boolean (no default)", () => {
    expect(() =>
      CreateAudienceConfigSchema.parse({ ...REQUIRED, email_type_option: undefined }),
    ).toThrow();
  });

  it("schema validates from_email is an email", () => {
    expect(() =>
      CreateAudienceConfigSchema.parse({
        ...REQUIRED,
        campaign_defaults: { ...REQUIRED.campaign_defaults, from_email: "not-email" },
      }),
    ).toThrow();
  });

  it("calls listCreate with the right field-name remapping", async () => {
    await createAudience(makeInput(REQUIRED));
    expect(mockListCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        dc: "us21",
        name: REQUIRED.name,
        permissionReminder: REQUIRED.permission_reminder,
        emailTypeOption: false,
        contact: REQUIRED.contact,
        campaignDefaults: REQUIRED.campaign_defaults,
      }),
    );
  });

  it("output shape stable", async () => {
    const result = await createAudience(makeInput(REQUIRED));
    expect(result.output).toEqual({
      audienceId: "abc",
      name: REQUIRED.name,
      webId: 99,
      dateCreated: "2026-01-01T00:00:00+00:00",
      memberCount: 0,
    });
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      CreateAudienceConfigSchema.parse({ ...REQUIRED, extra: 1 }),
    ).toThrow();
  });
});

// ─── create_custom_event ────────────────────────────────────────────────────

describe("create_custom_event", () => {
  it("schema enforces Mailchimp's event_name regex (lowercase, 1-30 chars)", () => {
    // Valid forms.
    for (const name of ["purchase", "purchased_product", "click_42_event"]) {
      expect(() =>
        CreateCustomEventConfigSchema.parse({
          audience_id: "list_1",
          email: "x@y.com",
          event_name: name,
        }),
      ).not.toThrow();
    }
    // Invalid forms.
    for (const bad of [
      "Purchase", // uppercase
      "purchase event", // space
      "purchase-event", // hyphen
      "1purchase", // starts with digit
      "a".repeat(31), // too long
      "", // empty
    ]) {
      expect(() =>
        CreateCustomEventConfigSchema.parse({
          audience_id: "list_1",
          email: "x@y.com",
          event_name: bad,
        }),
      ).toThrow();
    }
  });

  it("schema validates occurred_at as ISO-8601 datetime", () => {
    expect(() =>
      CreateCustomEventConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        event_name: "purchase",
        occurred_at: "not-a-date",
      }),
    ).toThrow();
    expect(() =>
      CreateCustomEventConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        event_name: "purchase",
        occurred_at: "2026-01-15T10:30:00Z",
      }),
    ).not.toThrow();
  });

  it("calls memberAddEvent with the right inputs (including occurredAt)", async () => {
    await createCustomEvent(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        event_name: "purchased",
        properties: { sku: "abc", price: "99.99" },
        occurred_at: "2026-01-15T10:30:00Z",
      }),
    );
    expect(mockMemberAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        dc: "us21",
        audienceId: "list_1",
        email: "x@y.com",
        name: "purchased",
        properties: { sku: "abc", price: "99.99" },
        occurredAt: "2026-01-15T10:30:00Z",
      }),
    );
  });

  it("output shape stable", async () => {
    const result = await createCustomEvent(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        event_name: "purchased",
      }),
    );
    expect(result.output.success).toBe(true);
    expect(result.output.eventName).toBe("purchased");
    expect(result.output.subscriberEmail).toBe("x@y.com");
    expect(typeof result.output.occurredAt).toBe("string");
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      CreateCustomEventConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        event_name: "purchased",
        extra: 1,
      }),
    ).toThrow();
  });
});

// ─── add_note ───────────────────────────────────────────────────────────────

describe("add_note", () => {
  beforeEach(() => {
    mockMemberAddNote.mockResolvedValue({
      id: 999,
      note: "Sample note",
      created_at: "2026-01-01T00:00:00+00:00",
    });
  });

  it("schema enforces note ≤1000 chars (Mailchimp limit)", () => {
    expect(() =>
      AddNoteConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        note: "a".repeat(1001),
      }),
    ).toThrow();
    expect(() =>
      AddNoteConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        note: "a".repeat(1000),
      }),
    ).not.toThrow();
  });

  it("schema rejects empty note", () => {
    expect(() =>
      AddNoteConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        note: "",
      }),
    ).toThrow();
  });

  it("calls memberAddNote with the right inputs", async () => {
    await addNote(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        note: "Sample note",
      }),
    );
    expect(mockMemberAddNote).toHaveBeenCalledWith(
      expect.objectContaining({
        dc: "us21",
        audienceId: "list_1",
        email: "x@y.com",
        note: "Sample note",
      }),
    );
  });

  it("output noteId is stringified (V2 stable string-id convention)", async () => {
    const result = await addNote(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        note: "Sample note",
      }),
    );
    expect(result.output.noteId).toBe("999");
  });
});
