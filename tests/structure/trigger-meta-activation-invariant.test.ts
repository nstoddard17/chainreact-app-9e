/**
 * Structure test: every TriggerMeta registered in the discovery
 * registry that needs server-side activation work has matching support
 * in the activation registry — Slice 3.10.
 *
 * Why this guard exists:
 *   - Phase 3 ships provider-trigger config wrappers (this slice).
 *   - Per-provider meta slices (3.11+) register `<trigger>.meta.ts`
 *     files one at a time. At the moment a meta is registered, the
 *     UI immediately becomes able to add + configure that trigger on
 *     the canvas.
 *   - If the meta lands BEFORE its activation-time backend work
 *     (snapshot init for polling; webhook subscription create for
 *     webhook providers that need per-workflow subscriptions), the
 *     user gets a configurable trigger that silently misbehaves at
 *     workflow Activate time. This test prevents that drift.
 *
 * Invariant (strict):
 *   For every `TriggerMeta` with
 *     activation ∈ {"webhook", "polling"} AND requiresIntegration === true
 *   there must be a registered activation function in the activation
 *   registry at the `(provider, eventType)` key.
 *
 * Polling rationale: V2 inherits V1's "first-poll-miss" rule
 * (CLAUDE.md "Polling Trigger Snapshot Initialization"). Without an
 * activation hook seeding the snapshot, the first poll establishes a
 * baseline and silently drops events that arrived between activation
 * and the first poll. This is a real correctness bug class.
 *
 * Webhook rationale: providers that need per-workflow subscriptions
 * (Stripe, GitHub, Airtable, Microsoft Graph, Google Drive, HubSpot,
 * Shopify, Trello) create the subscription resource in activate(). Without
 * it the receive route's strict-direct-lookup misses inbound payloads.
 *
 * Slack-shaped exemption (no per-workflow subscription; one global webhook
 * URL handles every workspace) is supported via `SHARED_INFRA_EXEMPT_KEYS`
 * below. The lifecycle service falls through cleanly when no activation is
 * registered (lifecycle.ts line 68 — just upserts the trigger_resources
 * row), so a meta can opt into this pattern by being added to the
 * exemption set with a documented justification.
 *
 * **Today's coverage:** GitHub `new_commit` is the only registered
 * trigger meta requiring a provider activation. Future meta slices
 * either (a) ship their activation registration in the same PR or
 * (b) add their key to `SHARED_INFRA_EXEMPT_KEYS` with the reason.
 */

// Force-load all provider modules so activations register at module init.
import "@/integrations/_registry";
import { findActivation } from "@/services/triggers/activationRegistry";
import { listAllTriggerMetas } from "@/services/discovery/_registry";

/**
 * Triggers that intentionally do NOT register an activation hook because
 * their provider uses shared infrastructure (one global webhook URL,
 * routed via filterRegistry rather than per-workflow subscription).
 *
 * Add an entry here only when the provider truly has no per-workflow
 * activation work to do. The string is the `${provider}:${type}` key.
 * The accompanying comment must explain *why*.
 */
const SHARED_INFRA_EXEMPT_KEYS: ReadonlySet<string> = new Set<string>([
  // Slack (Slice 3.11). Slack's Events API uses one global webhook URL
  // per app installation, routed at receive time via the per-(provider,
  // eventType) filter registry in `core/triggers/filterRegistry.ts`.
  // There is no per-workflow subscription to create at activate time —
  // `services/triggers/lifecycle.ts` writes a `trigger_resources` row
  // and the dispatcher looks the row up by (provider, event_type) and
  // gates it through the registered filter. The runtime filter for each
  // key lives at `integrations/slack/triggers/<event>/filter.ts`.
  "slack:message.channel",
  "slack:message.im",
  "slack:message.group",
  "slack:message.mpim",
  "slack:reaction_added",
  "slack:reaction_removed",
  "slack:channel_created",
  "slack:member_joined_channel",
  "slack:member_left_channel",
  "slack:file_shared",
]);

describe("trigger-meta ↔ activation-registry invariant", () => {
  it("every registered TriggerMeta that requires activation has a registered activation function", () => {
    const missingActivations: string[] = [];

    for (const meta of listAllTriggerMetas()) {
      if (!meta.requiresIntegration) continue;
      if (meta.activation !== "webhook" && meta.activation !== "polling") continue;
      if (SHARED_INFRA_EXEMPT_KEYS.has(meta.key)) continue;

      const activation = findActivation(meta.provider, meta.type);
      if (!activation) {
        missingActivations.push(meta.key);
      }
    }

    if (missingActivations.length > 0) {
      throw new Error(
        [
          "The following registered TriggerMeta entries declare activation = " +
            '"webhook" or "polling" with requiresIntegration: true, but no ' +
            "activation function is registered for (provider, eventType):",
          ...missingActivations.map((k) => `  - ${k}`),
          "",
          "Either:",
          "  1. Register an activation function in the provider's " +
            "triggers/<event>/index.ts via registerActivation(...) — see " +
            "integrations/github/triggers/newCommit/index.ts for the template; OR",
          "  2. If the provider uses shared infrastructure (Slack-style " +
            "single global webhook URL routed via filterRegistry), add the " +
            "key to SHARED_INFRA_EXEMPT_KEYS in this test file with a " +
            "documented reason; OR",
          "  3. If the meta isn't ready to ship, remove it from " +
            "services/discovery/_registry.ts.",
        ].join("\n"),
      );
    }
  });

  it("SHARED_INFRA_EXEMPT_KEYS only references currently-registered meta keys (no orphans)", () => {
    const registeredKeys = new Set(listAllTriggerMetas().map((m) => m.key));
    const orphans: string[] = [];
    for (const exempt of SHARED_INFRA_EXEMPT_KEYS) {
      if (!registeredKeys.has(exempt)) orphans.push(exempt);
    }
    expect(orphans).toEqual([]);
  });
});
