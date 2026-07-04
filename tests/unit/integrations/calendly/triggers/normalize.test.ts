/**
 * @jest-environment node
 *
 * Tests for the Calendly normalizers — Slice 5.CALENDLY-1.
 *
 * Covers the subscriber-scoped timestamp-free dedup key (the
 * collective-event co-host rationale), UUID extraction from resource
 * URIs, the bounded projection (no raw URI/API fields spread through),
 * embedded-scheduled_event absence tolerance (older payload
 * generation), reschedule flags, the canceled-only cancellation object,
 * purity (same input → same output), and the P-S2 filter semantics.
 */
import { normalizeEventScheduled } from "@/integrations/calendly/triggers/eventScheduled/normalize";
import { normalizeEventCanceled } from "@/integrations/calendly/triggers/eventCanceled/normalize";
import { makeCalendlyFilter } from "@/integrations/calendly/triggers/_shared/filter";
import { TriggerEventSchema } from "@/contracts/triggerEvent";
import type { CalendlyWebhookEnvelope } from "@/integrations/calendly/triggers/_shared/project";

const INVITEE_URI =
  "https://api.calendly.com/scheduled_events/EVT111/invitees/INV222";

function createdEnvelope(
  overrides: Partial<NonNullable<CalendlyWebhookEnvelope["payload"]>> = {},
): CalendlyWebhookEnvelope {
  return {
    event: "invitee.created",
    created_at: "2026-07-04T12:00:00.000000Z",
    created_by: "https://api.calendly.com/users/USER123",
    payload: {
      uri: INVITEE_URI,
      email: "invitee@example.test",
      name: "Ada Lovelace",
      status: "active",
      timezone: "America/Chicago",
      created_at: "2026-07-04T11:59:59.000000Z",
      rescheduled: false,
      old_invitee: null,
      new_invitee: null,
      cancel_url: "https://calendly.com/cancellations/INV222",
      reschedule_url: "https://calendly.com/reschedulings/INV222",
      questions_and_answers: [
        { question: "Topic?", answer: "Migration plan", position: 0 },
      ],
      tracking: {
        utm_campaign: "launch",
        utm_source: null,
        utm_medium: null,
        utm_content: null,
        utm_term: null,
        salesforce_uuid: null,
      },
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/EVT111",
        name: "Discovery Call",
        status: "active",
        start_time: "2026-07-10T15:00:00.000000Z",
        end_time: "2026-07-10T15:30:00.000000Z",
        event_type: "https://api.calendly.com/event_types/ET333",
        location: {
          type: "google_conference",
          location: null,
          join_url: "https://meet.google.com/abc",
        },
        event_memberships: [
          {
            user: "https://api.calendly.com/users/USER123",
            user_email: "host@example.test",
            user_name: "Marcus Leonard",
          },
        ],
      },
      ...overrides,
    },
  };
}

const CTX = { subscriberUserId: "USER123" };

describe("normalizeEventScheduled", () => {
  it("produces a valid TriggerEvent with the subscriber-scoped invitee dedup key", () => {
    const event = normalizeEventScheduled(createdEnvelope(), CTX);
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
    expect(event.provider).toBe("calendly");
    expect(event.eventType).toBe("event_scheduled");
    expect(event.eventId).toBe("event_scheduled:USER123:INV222");
    expect(event.occurredAt).toBe("2026-07-04T12:00:00.000000Z");
    expect(event.providerAccountId).toBe("USER123");
  });

  it("projects a bounded payload with UUIDs, never raw API URIs", () => {
    const { payload } = normalizeEventScheduled(createdEnvelope(), CTX);
    expect(payload).toMatchObject({
      changeKind: "event_scheduled",
      subscriberUserId: "USER123",
      inviteeId: "INV222",
      eventId: "EVT111",
      eventTypeId: "ET333",
      inviteeName: "Ada Lovelace",
      inviteeEmail: "invitee@example.test",
      inviteeTimezone: "America/Chicago",
      inviteeStatus: "active",
      meetingName: "Discovery Call",
      startTime: "2026-07-10T15:00:00.000000Z",
      endTime: "2026-07-10T15:30:00.000000Z",
      location: {
        type: "google_conference",
        location: null,
        joinUrl: "https://meet.google.com/abc",
      },
      hosts: [{ name: "Marcus Leonard", email: "host@example.test" }],
      questionsAndAnswers: [
        { question: "Topic?", answer: "Migration plan", position: 0 },
      ],
      rescheduled: false,
      cancelUrl: "https://calendly.com/cancellations/INV222",
      rescheduleUrl: "https://calendly.com/reschedulings/INV222",
    });
    // Raw API URIs are reduced to UUIDs — none flow through.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("api.calendly.com");
    // No cancellation key on the scheduled trigger.
    expect("cancellation" in (payload as Record<string, unknown>)).toBe(false);
  });

  it("tolerates the older payload generation WITHOUT an embedded scheduled_event", () => {
    const event = normalizeEventScheduled(
      createdEnvelope({ scheduled_event: null }),
      CTX,
    );
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
    // The scheduled-event uuid still resolves from the invitee URI path.
    expect(event.payload.eventId).toBe("EVT111");
    expect(event.payload.eventTypeId).toBeNull();
    expect(event.payload.startTime).toBeNull();
    expect(event.payload.meetingName).toBeNull();
    expect(event.payload.hosts).toEqual([]);
  });

  it("marks the reschedule half with rescheduled + oldInviteeId", () => {
    const event = normalizeEventScheduled(
      createdEnvelope({
        rescheduled: false,
        old_invitee:
          "https://api.calendly.com/scheduled_events/EVT000/invitees/INVOLD",
      }),
      CTX,
    );
    expect(event.payload.oldInviteeId).toBe("INVOLD");
  });

  it("is PURE: same input → same output (no clock/RNG in the dedup key)", () => {
    const env = createdEnvelope();
    const a = normalizeEventScheduled(env, CTX);
    const b = normalizeEventScheduled(env, CTX);
    expect(a).toEqual(b);
  });

  it("falls back to envelope created_at in the key when the invitee URI is absent, and 'no-user' without ctx attribution", () => {
    const noUri = normalizeEventScheduled(createdEnvelope({ uri: null }), CTX);
    expect(noUri.eventId).toBe(
      "event_scheduled:USER123:no-invitee:2026-07-04T12:00:00.000000Z",
    );
    const noCtx = normalizeEventScheduled(createdEnvelope(), {
      subscriberUserId: null,
    });
    expect(noCtx.eventId).toBe("event_scheduled:no-user:INV222");
    expect(noCtx.providerAccountId).toBe("unknown");
  });

  it("keys the SAME booking differently for two different subscribers (collective-event co-hosts)", () => {
    const env = createdEnvelope();
    const a = normalizeEventScheduled(env, { subscriberUserId: "USER123" });
    const b = normalizeEventScheduled(env, { subscriberUserId: "USER999" });
    // One booking, two user-scoped subscriptions → distinct dedup keys,
    // so the second user's delivery is never dropped as a duplicate.
    expect(a.eventId).not.toBe(b.eventId);
  });
});

describe("normalizeEventCanceled", () => {
  function canceledEnvelope(): CalendlyWebhookEnvelope {
    const env = createdEnvelope({
      status: "canceled",
      rescheduled: true,
      new_invitee:
        "https://api.calendly.com/scheduled_events/EVT999/invitees/INVNEW",
      cancellation: {
        canceled_by: "Marcus Leonard",
        reason: "conflict",
        canceler_type: "host",
      },
    });
    return { ...env, event: "invitee.canceled" };
  }

  it("produces the canceled dedup key and the cancellation projection", () => {
    const event = normalizeEventCanceled(canceledEnvelope(), CTX);
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
    expect(event.eventType).toBe("event_canceled");
    expect(event.eventId).toBe("event_canceled:USER123:INV222");
    expect(event.payload).toMatchObject({
      changeKind: "event_canceled",
      inviteeStatus: "canceled",
      rescheduled: true,
      newInviteeId: "INVNEW",
      cancellation: {
        canceledBy: "Marcus Leonard",
        reason: "conflict",
        cancelerType: "host",
      },
    });
  });

  it("never collides with the scheduled key for the same invitee (type prefix)", () => {
    const canceled = normalizeEventCanceled(canceledEnvelope(), CTX);
    const scheduled = normalizeEventScheduled(createdEnvelope(), CTX);
    expect(canceled.eventId).not.toBe(scheduled.eventId);
  });

  it("projects cancellation: null when the object is absent", () => {
    const env = canceledEnvelope();
    env.payload!.cancellation = null;
    const event = normalizeEventCanceled(env, CTX);
    expect(event.payload.cancellation).toBeNull();
  });
});

describe("P-S2 filter (shared factory)", () => {
  const filter = makeCalendlyFilter("event_scheduled");

  it("fails closed on a row missing the activation-written calendlyUserId", () => {
    expect(() => filter.parseConfig({})).toThrow();
    expect(() => filter.parseConfig({ eventTypeId: "ET333" })).toThrow();
  });

  it("matches when the subscriber attribution matches and no event-type filter is set", () => {
    const config = filter.parseConfig({ calendlyUserId: "USER123" });
    const event = normalizeEventScheduled(createdEnvelope(), CTX);
    expect(filter.evaluate(event, config)).toEqual({ kind: "match" });
  });

  it("rejects another user's rows (cross-account isolation)", () => {
    const config = filter.parseConfig({ calendlyUserId: "USER999" });
    const event = normalizeEventScheduled(createdEnvelope(), CTX);
    const result = filter.evaluate(event, config);
    expect(result.kind).toBe("no-match");
  });

  it("applies the optional eventTypeId filter (match + no-match + missing-payload fails closed)", () => {
    const config = filter.parseConfig({
      calendlyUserId: "USER123",
      eventTypeId: "ET333",
    });
    const matching = normalizeEventScheduled(createdEnvelope(), CTX);
    expect(filter.evaluate(matching, config)).toEqual({ kind: "match" });

    const otherType = normalizeEventScheduled(
      createdEnvelope({
        scheduled_event: {
          ...createdEnvelope().payload!.scheduled_event!,
          event_type: "https://api.calendly.com/event_types/ET444",
        },
      }),
      CTX,
    );
    expect(filter.evaluate(otherType, config).kind).toBe("no-match");

    // Older payload without embedded scheduled_event → eventTypeId null
    // → a configured filter fails CLOSED.
    const noType = normalizeEventScheduled(
      createdEnvelope({ scheduled_event: null }),
      CTX,
    );
    expect(filter.evaluate(noType, config).kind).toBe("no-match");
  });

  it("parseConfig tolerates the post-activation merged config (extra keys stripped)", () => {
    const config = filter.parseConfig({
      calendlyUserId: "USER123",
      webhookEnabled: true,
      hookSecretEncrypted: "enc(x)",
      subscriptionUri: "https://api.calendly.com/webhook_subscriptions/SUB",
    });
    expect(config.calendlyUserId).toBe("USER123");
  });
});
