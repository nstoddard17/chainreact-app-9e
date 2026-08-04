/**
 * @jest-environment node
 *
 * calendly/triggers trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockSubscriptionCreate = jest.fn();
const mockUsersMe = jest.fn();
const mockSubscriptionDelete = jest.fn();

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

jest.mock("@/integrations/_shared/calendly/api/webhookSubscriptions", () => ({
  webhookSubscriptionCreate: (...args: unknown[]) => mockSubscriptionCreate(...args),
  webhookSubscriptionDelete: (...args: unknown[]) => mockSubscriptionDelete(...args),
}));

jest.mock("@/integrations/_shared/calendly/api/users", () => ({
  usersMe: (...args: unknown[]) => mockUsersMe(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => s.slice(4, -1),
}));

import { InsufficientScopeError, IntegrationActionRequiredError } from "@/services/oauth/refreshAndRetry";
import { ConflictError, NotFoundError } from "@/integrations/_shared/calendly/errors";
import { makeCalendlyActivate } from "@/integrations/calendly/triggers/_shared/activate";
import { calendlyDeactivate } from "@/integrations/calendly/triggers/_shared/deactivate";
import { normalizeEventScheduled } from "@/integrations/calendly/triggers/eventScheduled/normalize";
import { normalizeEventCanceled } from "@/integrations/calendly/triggers/eventCanceled/normalize";
import { makeCalendlyFilter } from "@/integrations/calendly/triggers/_shared/filter";
import { TriggerEventSchema } from "@/contracts/triggerEvent";
import type { CalendlyWebhookEnvelope } from "@/integrations/calendly/triggers/_shared/project";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Tests for the shared Calendly activation factory — Slice 5.CALENDLY-1.
// The Calendly lifecycle has NO creation handshake: activate resolves
// the user/org URIs (account metadata first, /users/me fallback), mints
// the signing key itself, POSTs the subscription, and returns the full
// config patch (no pre-upsert, no read-back — Typeform posture).
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

const USER_URI = "https://api.calendly.com/users/USER123";
const ORG_URI = "https://api.calendly.com/organizations/ORG456";
const SUB_URI = "https://api.calendly.com/webhook_subscriptions/SUB789";

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "calendly",
    providerAccountId: "marcus@example.test",
    accountMetadata: {
      calendlyUserUri: USER_URI,
      organizationUri: ORG_URI,
    },
    ...overrides,
  } as never;
}

function node(config: Record<string, unknown>) {
  return {
    id: "node-1",
    kind: "trigger",
    provider: "calendly",
    type: "event_scheduled",
    config,
  } as never;
}

const activateScheduled = makeCalendlyActivate("event_scheduled");
const activateCanceled = makeCalendlyActivate("event_canceled");

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSubscriptionCreate.mockReset();
  mockUsersMe.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.CALENDLY_WEBHOOK_URL;
});

describe("makeCalendlyActivate — happy path", () => {
  it("POSTs the subscription with a minted signing key + strict-lookup URL and returns the full patch", async () => {
    mockSubscriptionCreate.mockResolvedValueOnce({
      uri: SUB_URI,
      state: "active",
    });

    const patch = await activateScheduled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);

    // Metadata carried both URIs — NO /users/me round-trip.
    expect(mockUsersMe).not.toHaveBeenCalled();

    expect(mockSubscriptionCreate).toHaveBeenCalledTimes(1);
    const createArg = mockSubscriptionCreate.mock.calls[0]![0];
    expect(createArg.events).toEqual(["invitee.created"]);
    expect(createArg.organizationUri).toBe(ORG_URI);
    expect(createArg.userUri).toBe(USER_URI);
    expect(createArg.url).toBe(
      "https://app.example.test/api/webhooks/calendly?workflowId=wf-1&nodeId=node-1",
    );
    // Minted signing key: 32 random bytes, base64url.
    expect(typeof createArg.signingKey).toBe("string");
    expect(createArg.signingKey.length).toBeGreaterThanOrEqual(43);

    // The patch carries the ENCRYPTED key + lifecycle fields.
    expect(patch).toMatchObject({
      webhookEnabled: true,
      subscriptionUri: SUB_URI,
      hookSecretEncrypted: `enc(${createArg.signingKey})`,
      notificationUrl:
        "https://app.example.test/api/webhooks/calendly?workflowId=wf-1&nodeId=node-1",
      calendlyUserId: "USER123",
      calendlyUserUri: USER_URI,
      organizationUri: ORG_URI,
    });
    // No eventTypeId key when the builder left the filter empty.
    expect("eventTypeId" in patch).toBe(false);
    // Never persisted in plaintext.
    expect(JSON.stringify(patch)).not.toContain(`"${createArg.signingKey}"`);
  });

  it("subscribes invitee.canceled for the event_canceled trigger", async () => {
    mockSubscriptionCreate.mockResolvedValueOnce({ uri: SUB_URI });
    await activateCanceled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    expect(mockSubscriptionCreate.mock.calls[0]![0].events).toEqual([
      "invitee.canceled",
    ]);
  });

  it("passes the optional eventTypeId filter through to the patch", async () => {
    mockSubscriptionCreate.mockResolvedValueOnce({ uri: SUB_URI });
    const patch = await activateScheduled({
      node: node({ eventTypeId: "ET123" }),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    expect(patch.eventTypeId).toBe("ET123");
  });

  it("mints a FRESH signing key per activation", async () => {
    mockSubscriptionCreate.mockResolvedValue({ uri: SUB_URI });
    await activateScheduled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    await activateScheduled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    const first = mockSubscriptionCreate.mock.calls[0]![0].signingKey;
    const second = mockSubscriptionCreate.mock.calls[1]![0].signingKey;
    expect(first).not.toBe(second);
  });

  it("falls back to GET /users/me when account metadata lacks the URIs", async () => {
    mockUsersMe.mockResolvedValueOnce({
      uri: USER_URI,
      current_organization: ORG_URI,
    });
    mockSubscriptionCreate.mockResolvedValueOnce({ uri: SUB_URI });

    const patch = await activateScheduled({
      node: node({}),
      integration: integration({ accountMetadata: {} }),
      workflowId: "wf-1",
    } as never);

    expect(mockUsersMe).toHaveBeenCalledTimes(1);
    expect(patch.calendlyUserId).toBe("USER123");
    expect(mockSubscriptionCreate.mock.calls[0]![0].userUri).toBe(USER_URI);
  });

  it("honors the CALENDLY_WEBHOOK_URL override and strips a doubled path", async () => {
    process.env.CALENDLY_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/calendly";
    mockSubscriptionCreate.mockResolvedValueOnce({ uri: SUB_URI });
    await activateScheduled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    expect(mockSubscriptionCreate.mock.calls[0]![0].url).toBe(
      "https://tunnel.example.test/api/webhooks/calendly?workflowId=wf-1&nodeId=node-1",
    );
  });
});

describe("makeCalendlyActivate — failures", () => {
  it("throws when identity is unresolvable even via /users/me (nothing created)", async () => {
    mockUsersMe.mockResolvedValueOnce({ uri: null, current_organization: null });
    await expect(
      activateScheduled({
        node: node({}),
        integration: integration({ accountMetadata: {} }),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow(/user\/organization URIs/);
    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
  });

  it("humanizes the 403 plan/scope gate (paid plan OR missing webhooks:write)", async () => {
    mockSubscriptionCreate.mockRejectedValueOnce(
      new InsufficientScopeError("HTTP 403"),
    );
    await expect(
      activateScheduled({
        node: node({}),
        integration: integration(),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow(/paid Calendly plan/);
  });

  it("humanizes a 409 duplicate subscription (orphan from a crashed lifecycle)", async () => {
    mockSubscriptionCreate.mockRejectedValueOnce(new ConflictError("dup"));
    await expect(
      activateScheduled({
        node: node({}),
        integration: integration(),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow(/Deactivate the workflow/);
  });

  it("propagates a generic POST failure (activation aborts; nothing to clean up)", async () => {
    mockSubscriptionCreate.mockRejectedValueOnce(new Error("provider down"));
    await expect(
      activateScheduled({
        node: node({}),
        integration: integration(),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow("provider down");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// Tests for the shared Calendly deactivation hook — Slice 5.CALENDLY-1.
// Best-effort semantics (exact Asana/Typeform posture): NotFound and
// dead-credential swallowed, other errors propagate, no-op without a
// stored subscription URI.
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

const SUB_URI = "https://api.calendly.com/webhook_subscriptions/SUB789";

function ctx(config: Record<string, unknown>) {
  return {
    trigger: {
      id: "tr-1",
      provider: "calendly",
      eventType: "event_scheduled",
      config,
    },
    integration: {
      id: "int-1",
      accountId: "acct-1",
      provider: "calendly",
      providerAccountId: "marcus@example.test",
    },
  } as never;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSubscriptionDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("calendlyDeactivate", () => {
  it("DELETEs the subscription by the UUID extracted from the stored URI", async () => {
    mockSubscriptionDelete.mockResolvedValueOnce(undefined);
    await calendlyDeactivate(ctx({ subscriptionUri: SUB_URI }));
    expect(mockSubscriptionDelete).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionDelete.mock.calls[0]![0]).toMatchObject({
      subscriptionUuid: "SUB789",
    });
  });

  it("skips silently when the row has no subscriptionUri (activation never completed)", async () => {
    await calendlyDeactivate(ctx({}));
    await calendlyDeactivate(ctx({ subscriptionUri: "" }));
    expect(mockSubscriptionDelete).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (already gone provider-side)", async () => {
    mockSubscriptionDelete.mockRejectedValueOnce(
      new NotFoundError("webhook subscription SUB789"),
    );
    await expect(
      calendlyDeactivate(ctx({ subscriptionUri: SUB_URI })),
    ).resolves.toBeUndefined();
  });

  it("swallows IntegrationActionRequiredError (dead credential; cleanup is best-effort)", async () => {
    mockSubscriptionDelete.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "calendly",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      calendlyDeactivate(ctx({ subscriptionUri: SUB_URI })),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (orchestrator logs and proceeds)", async () => {
    mockSubscriptionDelete.mockRejectedValueOnce(new Error("rate limited"));
    await expect(
      calendlyDeactivate(ctx({ subscriptionUri: SUB_URI })),
    ).rejects.toThrow("rate limited");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Tests for the Calendly normalizers — Slice 5.CALENDLY-1.
// Covers the subscriber-scoped timestamp-free dedup key (the
// collective-event co-host rationale), UUID extraction from resource
// URIs, the bounded projection (no raw URI/API fields spread through),
// embedded-scheduled_event absence tolerance (older payload
// generation), reschedule flags, the canceled-only cancellation object,
// purity (same input → same output), and the P-S2 filter semantics.
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

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

});
