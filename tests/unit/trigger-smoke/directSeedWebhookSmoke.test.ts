/**
 * @jest-environment node
 *
 * Unit tests for the generic direct-seed webhook trigger-smoke orchestrator
 * (tests/trigger-smoke/directSeedWebhookSmoke.ts) and the four consolidated
 * provider specs (Stripe / Shopify / HubSpot / Mailchimp). No DB, no route.
 *
 * Orchestrator (injected fakes): registration must store the canonical dispatch
 * key, baseline-first, delivery non-200 fails, exactly-one-run + identity,
 * terminal 'succeeded', dedup on re-send, cleanup ALWAYS runs.
 *
 * Provider specs (pure, cross-checked against PRODUCTION code):
 *   - every synthetic body is accepted by the provider's REAL signature
 *     verifier (Stripe t=,v1= per-row secret; Shopify base64 raw-body HMAC;
 *     HubSpot V3 canonical string; Mailchimp has no scheme — its content-hash
 *     key must equal production's mailchimpDedupKey),
 *   - the provider's REAL normalizer emits the spec's canonical eventType,
 *     the identity's eventId, and preserves the crsmoke markers,
 *   - the synthetic event/topic/subscription type is on the provider's REAL
 *     allowlist,
 *   - identityMatches accepts the normalized payload and rejects corruption.
 */
import {
  runDirectSeedWebhookSmoke,
  buildDirectSeedSmokeWorkflow,
  type DirectSeedSmokeIdentity,
  type DirectSeedSmokeRun,
  type DirectSeedWebhookSmokeDeps,
  type DirectSeedWebhookSpec,
} from "@/tests/trigger-smoke/directSeedWebhookSmoke";
import {
  STRIPE_EVENT_RECEIVED_SPEC,
  STRIPE_SMOKE_EVENT_TYPE,
  buildStripeSmokeBody,
  signStripeSmokeBody,
  type StripeWebhookSmokeIdentity,
} from "@/tests/trigger-smoke/stripeWebhookSmoke";
import {
  SHOPIFY_WEBHOOK_RECEIVED_SPEC,
  SHOPIFY_SMOKE_TOPIC,
  buildShopifySmokeBody,
  signShopifySmokeBody,
  type ShopifyWebhookSmokeIdentity,
} from "@/tests/trigger-smoke/shopifyWebhookSmoke";
import {
  HUBSPOT_WEBHOOK_RECEIVED_SPEC,
  HUBSPOT_SMOKE_SUBSCRIPTION_TYPE,
  buildHubSpotSmokeBody,
  signHubSpotSmokeRequest,
  type HubSpotWebhookSmokeIdentity,
} from "@/tests/trigger-smoke/hubspotWebhookSmoke";
import {
  MAILCHIMP_AUDIENCE_EVENT_SPEC,
  MAILCHIMP_SMOKE_EVENT_NAME,
  buildMailchimpSmokeBody,
  mailchimpSmokeDedupKey,
  type MailchimpWebhookSmokeIdentity,
} from "@/tests/trigger-smoke/mailchimpWebhookSmoke";

import { verifyStripeSignature } from "@/integrations/_shared/stripe/webhooks/signature";
import { verifyShopifySignature } from "@/integrations/_shared/shopify/webhooks/signature";
import { verifyHubSpotSignature } from "@/integrations/_shared/hubspot/webhooks/signature";
import { normalizeStripeEvent } from "@/integrations/stripe/triggers/eventReceived/normalize";
import { isAllowedStripeEventType } from "@/integrations/stripe/triggers/eventReceived/allowedEventTypes";
import { normalizeShopifyEvent } from "@/integrations/shopify/triggers/webhookReceived/normalize";
import { isAllowedShopifyTopic } from "@/integrations/shopify/triggers/webhookReceived/allowedTopics";
import {
  normalizeHubSpotEvent,
  type HubSpotWebhookEvent,
} from "@/integrations/hubspot/triggers/webhookReceived/normalize";
import { isAllowedHubSpotSubscriptionType } from "@/integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes";
import {
  normalizeMailchimpEvent,
  parseMailchimpFormBody,
  mailchimpDedupKey,
} from "@/integrations/_shared/mailchimp/webhooks/normalize";
import { isAllowedMailchimpEventType } from "@/integrations/mailchimp/triggers/audienceEvent/allowedEventTypes";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;

const STRIPE_IDENTITY: StripeWebhookSmokeIdentity = {
  eventId: "evt_crsmoke_test_1",
  endpointSecret: "whsec_crsmoketest",
  objectId: "cs_crsmoke_test_1",
  createdUnix: 1_700_000_000,
};

const SHOPIFY_IDENTITY: ShopifyWebhookSmokeIdentity = {
  eventId: "crsmoke-shopify-test-1",
  shopDomain: "crsmoke-test.myshopify.com",
  orderId: 1_700_000_000_000,
  orderName: "#crsmoke-order-test",
  triggeredAt: "2026-07-06T00:00:00.000Z",
};

const HUBSPOT_IDENTITY: HubSpotWebhookSmokeIdentity = {
  eventId: "crsmoke-hs-test-1",
  portalId: "crsmoke-portal-test",
  objectId: "crsmoke-object-test",
  hubspotSubscriptionId: "crsmoke-hssub-test",
  occurredAtMs: 1_700_000_000_000,
};

const MC_SEED = {
  audienceId: "crsmokelisttest",
  email: "crsmoke-test@example.invalid",
  subscriberHash: "crsmokehashtest",
  firedAt: "2026-07-06T00:00:00.000Z",
};
const MC_RAW_BODY = buildMailchimpSmokeBody(MC_SEED);
const MAILCHIMP_IDENTITY: MailchimpWebhookSmokeIdentity = {
  ...MC_SEED,
  rawBody: MC_RAW_BODY,
  eventId: mailchimpSmokeDedupKey(MC_RAW_BODY),
  providerAccountId: "crsmoke-mc-account-test",
};

/** Echo what each route would persist: the REAL normalizer's output. */
function normalizedRunFor(
  expectedEventType: string,
  payload: Record<string, unknown>,
  eventId: string,
): DirectSeedSmokeRun {
  return {
    runId: "r",
    status: "queued",
    triggerPayload: payload,
    eventId,
    eventType: expectedEventType,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator contract (fakes; the Stripe spec is the vehicle)
// ---------------------------------------------------------------------------

interface FakeOpts {
  seededEventType?: string | null;
  preexistingRuns?: number;
  deliverStatus?: number;
  deliverPushesRun?: boolean;
  corruptPayload?: boolean;
  drainStatus?: DirectSeedSmokeRun["status"];
  dedupBroken?: boolean;
  throwOnSeed?: boolean;
}

interface FakeState {
  workflowCreated: boolean;
  seedCalled: boolean;
  cleanedRegistration: boolean;
  cleanedDedup: boolean;
  deliveries: number;
}

function makeFakeDeps(
  opts: FakeOpts = {},
): { deps: DirectSeedWebhookSmokeDeps<StripeWebhookSmokeIdentity>; state: FakeState } {
  const runs: DirectSeedSmokeRun[] = [];
  for (let i = 0; i < (opts.preexistingRuns ?? 0); i += 1) {
    runs.push({ runId: `pre-${i}`, status: "queued", triggerPayload: null, eventId: null, eventType: null });
  }
  const seen = new Set<string>();
  const state: FakeState = {
    workflowCreated: false,
    seedCalled: false,
    cleanedRegistration: false,
    cleanedDedup: false,
    deliveries: 0,
  };
  const spec = STRIPE_EVENT_RECEIVED_SPEC;

  function pushRun(identity: StripeWebhookSmokeIdentity): void {
    const normalized = normalizeStripeEvent(JSON.parse(buildStripeSmokeBody(identity)));
    runs.push({
      runId: `run-${runs.length + 1}`,
      status: "queued",
      triggerPayload: opts.corruptPayload
        ? { stripeEventType: "wrong.event", bad: true }
        : (normalized.payload as Record<string, unknown>),
      eventId: identity.eventId,
      eventType: spec.expectedEventType,
    });
  }

  const deps: DirectSeedWebhookSmokeDeps<StripeWebhookSmokeIdentity> = {
    mintIdentity: () => STRIPE_IDENTITY,
    async createActiveSmokeWorkflow() {
      state.workflowCreated = true;
      return { workflowId: "wf-test" };
    },
    async seedRegistration() {
      state.seedCalled = true;
      if (opts.throwOnSeed) throw new Error("seed boom");
      return {
        seededEventType:
          opts.seededEventType === undefined ? spec.expectedEventType : opts.seededEventType,
      };
    },
    async deliverSyntheticEvent({ identity }) {
      state.deliveries += 1;
      const status = opts.deliverStatus ?? 200;
      if (status !== 200) return { httpStatus: status };
      const isRedeliver = seen.has(identity.eventId);
      if (!isRedeliver) {
        seen.add(identity.eventId);
        if (opts.deliverPushesRun ?? true) pushRun(identity);
      } else if (opts.dedupBroken) {
        pushRun(identity);
      }
      return { httpStatus: 200 };
    },
    async listRuns() {
      return runs.map((r) => ({ ...r }));
    },
    async drainRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      if (run) {
        (run as { status: DirectSeedSmokeRun["status"] }).status =
          opts.drainStatus === undefined ? "succeeded" : opts.drainStatus;
      }
    },
    async readRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      return run ? { ...run } : null;
    },
    async cleanupRegistration() {
      state.cleanedRegistration = true;
    },
    async cleanupDedup() {
      state.cleanedDedup = true;
    },
    async sleep() {
      /* no-op */
    },
  };
  return { deps, state };
}

describe("runDirectSeedWebhookSmoke — orchestrator contract", () => {
  it("passes: seed canonical → baseline 0 → deliver → 1 run identified → succeeded → dedup holds → cleaned", async () => {
    const { deps, state } = makeFakeDeps();
    const r = await runDirectSeedWebhookSmoke(deps, STRIPE_EVENT_RECEIVED_SPEC, FAST);

    expect(r.outcome).toBe("pass");
    expect(r.triggerLabel).toBe("stripe:event_received");
    expect(r.seededEventType).toBe("event_received");
    expect(r.baselineRunCount).toBe(0);
    expect(r.deliverHttpStatus).toBe(200);
    expect(r.afterRunCount).toBe(1);
    expect(r.identityMatched).toBe(true);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.afterRedeliverRunCount).toBe(1);
    expect(r.dedupProven).toBe(true);
    expect(r.cleaned).toBe(true);
    expect(state.deliveries).toBe(2);
    expect(state.cleanedRegistration).toBe(true);
    expect(state.cleanedDedup).toBe(true);
  });

  it("fails when the seeded registration stored a non-canonical event_type", async () => {
    const { deps } = makeFakeDeps({ seededEventType: "wrong_type" });
    const r = await runDirectSeedWebhookSmoke(deps, STRIPE_EVENT_RECEIVED_SPEC, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/event_type/);
    expect(r.cleaned).toBe(true);
  });

  it("fails on baseline violation without delivering", async () => {
    const { deps, state } = makeFakeDeps({ preexistingRuns: 1 });
    const r = await runDirectSeedWebhookSmoke(deps, STRIPE_EVENT_RECEIVED_SPEC, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline/);
    expect(state.deliveries).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the webhook route returns non-200", async () => {
    const { deps } = makeFakeDeps({ deliverStatus: 401 });
    const r = await runDirectSeedWebhookSmoke(deps, STRIPE_EVENT_RECEIVED_SPEC, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.deliverHttpStatus).toBe(401);
    expect(r.cleaned).toBe(true);
  });

  it("fails when no run appears after delivery", async () => {
    const { deps } = makeFakeDeps({ deliverPushesRun: false });
    const r = await runDirectSeedWebhookSmoke(deps, STRIPE_EVENT_RECEIVED_SPEC, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/exactly 1 run/);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run does not identify the synthetic event", async () => {
    const { deps } = makeFakeDeps({ corruptPayload: true });
    const r = await runDirectSeedWebhookSmoke(deps, STRIPE_EVENT_RECEIVED_SPEC, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify/);
    expect(r.identityMatched).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the drained run is not terminal 'succeeded'", async () => {
    const { deps } = makeFakeDeps({ drainStatus: "failed" });
    const r = await runDirectSeedWebhookSmoke(deps, STRIPE_EVENT_RECEIVED_SPEC, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.terminalStatus).toBe("failed");
    expect(r.identityMatched).toBe(true);
    expect(r.cleaned).toBe(true);
  });

  it("fails when dedup does not hold on re-send", async () => {
    const { deps } = makeFakeDeps({ dedupBroken: true });
    const r = await runDirectSeedWebhookSmoke(deps, STRIPE_EVENT_RECEIVED_SPEC, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/dedup/);
    expect(r.afterRedeliverRunCount).toBe(2);
    expect(r.dedupProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("still cleans up when the body throws", async () => {
    const { deps, state } = makeFakeDeps({ throwOnSeed: true });
    const r = await runDirectSeedWebhookSmoke(deps, STRIPE_EVENT_RECEIVED_SPEC, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/seed boom/);
    expect(state.workflowCreated).toBe(true);
    expect(state.cleanedRegistration).toBe(true);
    expect(state.cleanedDedup).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Provider specs — cross-checked against PRODUCTION verify/normalize/allowlist
// ---------------------------------------------------------------------------

describe("stripe:event_received spec", () => {
  const rawBody = buildStripeSmokeBody(STRIPE_IDENTITY);

  it("synthetic event type is on the REAL allowlist", () => {
    expect(isAllowedStripeEventType(STRIPE_SMOKE_EVENT_TYPE)).toBe(true);
  });

  it("signature is accepted by the REAL verifier (per-row secret, t=,v1=)", () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = signStripeSmokeBody(ts, rawBody, STRIPE_IDENTITY.endpointSecret);
    expect(verifyStripeSignature(rawBody, header, STRIPE_IDENTITY.endpointSecret)).toEqual({
      valid: true,
    });
    // Wrong secret must NOT verify — the smoke never weakens verification.
    const wrong = verifyStripeSignature(rawBody, header, "whsec_other");
    expect(wrong.valid).toBe(false);
  });

  it("REAL normalizer emits event_received + the identity's eventId + the marker", () => {
    const normalized = normalizeStripeEvent(JSON.parse(rawBody));
    expect(normalized.eventType).toBe("event_received");
    expect(normalized.eventId).toBe(STRIPE_IDENTITY.eventId);
    expect(normalized.payload.stripeEventType).toBe(STRIPE_SMOKE_EVENT_TYPE);
    const run = normalizedRunFor(
      STRIPE_EVENT_RECEIVED_SPEC.expectedEventType,
      normalized.payload as Record<string, unknown>,
      normalized.eventId,
    );
    expect(STRIPE_EVENT_RECEIVED_SPEC.identityMatches(run, STRIPE_IDENTITY)).toBe(true);
  });

  it("workflow node carries the meta's required enabledEvents", () => {
    const wf = STRIPE_EVENT_RECEIVED_SPEC.buildWorkflow();
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.config).toEqual({ enabledEvents: [STRIPE_SMOKE_EVENT_TYPE] });
  });
});

describe("shopify:webhook_received spec", () => {
  const rawBody = buildShopifySmokeBody(SHOPIFY_IDENTITY);

  it("synthetic topic is on the REAL allowlist", () => {
    expect(isAllowedShopifyTopic(SHOPIFY_SMOKE_TOPIC)).toBe(true);
  });

  it("signature is accepted by the REAL verifier (base64 HMAC over raw body)", () => {
    const header = signShopifySmokeBody(rawBody, "shopify-test-secret");
    expect(verifyShopifySignature(rawBody, header, "shopify-test-secret")).toEqual({
      valid: true,
    });
    expect(verifyShopifySignature(rawBody, header, "other-secret").valid).toBe(false);
  });

  it("REAL normalizer emits webhook_received keyed on the webhook id + preserves the marker body", () => {
    const normalized = normalizeShopifyEvent({
      headers: {
        topic: SHOPIFY_SMOKE_TOPIC,
        shopDomain: SHOPIFY_IDENTITY.shopDomain,
        webhookId: SHOPIFY_IDENTITY.eventId,
        triggeredAt: SHOPIFY_IDENTITY.triggeredAt,
      },
      body: JSON.parse(rawBody),
    });
    expect(normalized.eventType).toBe("webhook_received");
    expect(normalized.eventId).toBe(SHOPIFY_IDENTITY.eventId);
    const run = normalizedRunFor(
      SHOPIFY_WEBHOOK_RECEIVED_SPEC.expectedEventType,
      normalized.payload as Record<string, unknown>,
      normalized.eventId,
    );
    expect(SHOPIFY_WEBHOOK_RECEIVED_SPEC.identityMatches(run, SHOPIFY_IDENTITY)).toBe(true);
  });

  it("workflow node carries the meta's required topics (also the seeded allowlist)", () => {
    const wf = SHOPIFY_WEBHOOK_RECEIVED_SPEC.buildWorkflow();
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.config).toEqual({ topics: [SHOPIFY_SMOKE_TOPIC] });
  });
});

describe("hubspot:webhook_received spec", () => {
  const rawBody = buildHubSpotSmokeBody(HUBSPOT_IDENTITY, "12345");

  it("synthetic subscription type is on the REAL allowlist", () => {
    expect(isAllowedHubSpotSubscriptionType(HUBSPOT_SMOKE_SUBSCRIPTION_TYPE)).toBe(true);
  });

  it("body is a one-event ARRAY (HubSpot's wire format)", () => {
    const parsed = JSON.parse(rawBody) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it("signature is accepted by the REAL verifier (V3 canonical string + timestamp)", () => {
    const timestampMs = Date.now();
    const requestUri = "https://app.example.test/api/webhooks/hubspot";
    const header = signHubSpotSmokeRequest({
      method: "POST",
      requestUri,
      rawBody,
      timestampMs,
      secret: "hubspot-test-secret",
    });
    expect(
      verifyHubSpotSignature({
        method: "POST",
        requestUri,
        rawBody,
        signatureHeader: header,
        timestampHeader: String(timestampMs),
        secret: "hubspot-test-secret",
        nowMs: timestampMs,
      }),
    ).toEqual({ valid: true });
    // A different canonical URI must NOT verify (URI is part of the signature).
    expect(
      verifyHubSpotSignature({
        method: "POST",
        requestUri: "https://other.example.test/api/webhooks/hubspot",
        rawBody,
        signatureHeader: header,
        timestampHeader: String(timestampMs),
        secret: "hubspot-test-secret",
        nowMs: timestampMs,
      }).valid,
    ).toBe(false);
  });

  it("REAL normalizer emits webhook_received + the identity's eventId + the markers", () => {
    const event = (JSON.parse(rawBody) as HubSpotWebhookEvent[])[0]!;
    const normalized = normalizeHubSpotEvent(event);
    expect(normalized.eventType).toBe("webhook_received");
    expect(normalized.eventId).toBe(HUBSPOT_IDENTITY.eventId);
    expect(normalized.payload.subscriptionType).toBe(HUBSPOT_SMOKE_SUBSCRIPTION_TYPE);
    const run = normalizedRunFor(
      HUBSPOT_WEBHOOK_RECEIVED_SPEC.expectedEventType,
      normalized.payload as Record<string, unknown>,
      normalized.eventId,
    );
    expect(HUBSPOT_WEBHOOK_RECEIVED_SPEC.identityMatches(run, HUBSPOT_IDENTITY)).toBe(true);
  });

  it("workflow node carries the meta's required subscriptions (no propertyName on creation)", () => {
    const wf = HUBSPOT_WEBHOOK_RECEIVED_SPEC.buildWorkflow();
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.config).toEqual({
      subscriptions: [{ eventType: HUBSPOT_SMOKE_SUBSCRIPTION_TYPE }],
    });
  });
});

describe("mailchimp:audience_event spec", () => {
  it("synthetic event name is on the REAL allowlist", () => {
    expect(isAllowedMailchimpEventType(MAILCHIMP_SMOKE_EVENT_NAME)).toBe(true);
  });

  it("content-hash dedup key equals PRODUCTION's mailchimpDedupKey over the same bytes", () => {
    expect(MAILCHIMP_IDENTITY.eventId).toBe(mailchimpDedupKey(MAILCHIMP_IDENTITY.rawBody));
  });

  it("smoke email uses the reserved .invalid TLD and carries the crsmoke marker", () => {
    expect(MAILCHIMP_IDENTITY.email.endsWith("@example.invalid")).toBe(true);
    expect(MAILCHIMP_IDENTITY.email).toContain("crsmoke");
  });

  it("REAL parser + normalizer emit audience_event + the content-hash eventId + the markers", () => {
    const parsed = parseMailchimpFormBody(MAILCHIMP_IDENTITY.rawBody);
    expect(parsed.type).toBe(MAILCHIMP_SMOKE_EVENT_NAME);
    expect(parsed.data.list_id).toBe(MAILCHIMP_IDENTITY.audienceId);
    const normalized = normalizeMailchimpEvent({
      rawBody: MAILCHIMP_IDENTITY.rawBody,
      parsed,
      providerAccountId: MAILCHIMP_IDENTITY.providerAccountId,
    });
    expect(normalized.eventType).toBe("audience_event");
    expect(normalized.eventId).toBe(MAILCHIMP_IDENTITY.eventId);
    const run = normalizedRunFor(
      MAILCHIMP_AUDIENCE_EVENT_SPEC.expectedEventType,
      normalized.payload as Record<string, unknown>,
      normalized.eventId,
    );
    expect(MAILCHIMP_AUDIENCE_EVENT_SPEC.identityMatches(run, MAILCHIMP_IDENTITY)).toBe(true);
  });

  it("identity fails when the email marker is lost", () => {
    const parsed = parseMailchimpFormBody(MAILCHIMP_IDENTITY.rawBody);
    const normalized = normalizeMailchimpEvent({
      rawBody: MAILCHIMP_IDENTITY.rawBody,
      parsed,
      providerAccountId: MAILCHIMP_IDENTITY.providerAccountId,
    });
    const run: DirectSeedSmokeRun = {
      runId: "r",
      status: "queued",
      triggerPayload: {
        ...(normalized.payload as Record<string, unknown>),
        email: "someone-else@example.invalid",
      },
      eventId: normalized.eventId,
      eventType: normalized.eventType,
    };
    expect(MAILCHIMP_AUDIENCE_EVENT_SPEC.identityMatches(run, MAILCHIMP_IDENTITY)).toBe(false);
  });
});

describe("shared workflow builder", () => {
  it("builds a valid {trigger → native no-op} definition with the given config", () => {
    const wf = buildDirectSeedSmokeWorkflow("stripe", "event_received", { a: 1 }, "x");
    expect(wf.definition.nodes).toHaveLength(2);
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.kind).toBe("trigger");
    expect(trigger.provider).toBe("stripe");
    expect(trigger.config).toEqual({ a: 1 });
    const action = wf.definition.nodes.find((n) => n.id === wf.actionNodeId)!;
    expect(action.provider).toBe("native");
    expect(wf.definition.edges).toHaveLength(1);
  });
});

// Type-level guard: every spec is a DirectSeedWebhookSpec over an identity that
// extends the base identity (compile-time only; runtime assertion is trivial).
const ALL_SPECS: ReadonlyArray<DirectSeedWebhookSpec<DirectSeedSmokeIdentity>> = [
  STRIPE_EVENT_RECEIVED_SPEC as DirectSeedWebhookSpec<DirectSeedSmokeIdentity>,
  SHOPIFY_WEBHOOK_RECEIVED_SPEC as DirectSeedWebhookSpec<DirectSeedSmokeIdentity>,
  HUBSPOT_WEBHOOK_RECEIVED_SPEC as DirectSeedWebhookSpec<DirectSeedSmokeIdentity>,
  MAILCHIMP_AUDIENCE_EVENT_SPEC as DirectSeedWebhookSpec<DirectSeedSmokeIdentity>,
];

describe("consolidated spec inventory", () => {
  it("labels and canonical event types are the registered consolidated triggers", () => {
    expect(ALL_SPECS.map((s) => `${s.provider}:${s.expectedEventType}`)).toEqual([
      "stripe:event_received",
      "shopify:webhook_received",
      "hubspot:webhook_received",
      "mailchimp:audience_event",
    ]);
  });
});
