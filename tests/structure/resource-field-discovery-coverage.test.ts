/**
 * @jest-environment node
 *
 * RESOLVERS-1 — resource-field discovery coverage guard.
 *
 * PRODUCT RULE (the north star): a normal user must be able to configure the
 * common path by SELECTING recognizable provider resources. They must never be
 * required to leave ChainReact, inspect a URL, or hunt an opaque provider id
 * just to fill a Setup field. Manual id entry is a power-user fallback, not the
 * only path.
 *
 * This guard scans EVERY builder-visible action + trigger field (the discovery
 * registry is exactly what the builder renders) and fails when a field that
 * REFERENCES A PROVIDER RESOURCE is rendered as plain text with no registered
 * `optionsSource` — unless it carries a documented exemption below.
 *
 * The exemption list is the honest ledger of "why this one can't be a picker",
 * and every entry needs a real reason from one of these four classes (per the
 * corrective-pass acceptance rules):
 *
 *   UPSTREAM   — the value is produced by an earlier step / trigger at runtime
 *                (message ids, run ids, payment intents). There is no
 *                meaningful browse list; mapping is the correct UX.
 *   NO-LISTING — the provider exposes no supported way to discover it.
 *   SCOPE      — listing requires a scope/permission the manifest doesn't have
 *                (adding one forces every connection to reconnect — an owner
 *                decision, not a silent code change).
 *   CONTRACT   — a builder/runtime contract blocks the picker today (e.g. the
 *                object-list row sub-field contract has no optionsSource, or
 *                the runtime schema stores a number a combobox can't commit).
 *
 * Adding a raw-id field WITHOUT an exemption fails this test — that is the
 * point: new provider work must not quietly reintroduce paste-the-id UX.
 */
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import { listOptionsResolvers } from "@/services/options/_registry";
import type { FieldMeta } from "@/contracts/actionMeta";

/**
 * Field-name shapes that denote a provider resource reference. Deliberately
 * NAME-BASED as a net: it is a *guard*, not the classifier — a real
 * classification lives in the per-field decision (picker or documented
 * exemption). False positives are cheap to exempt; false negatives are the
 * thing we can't afford.
 */
const RESOURCE_NAME_RE = /(^|[a-z_])(id|ids)$/i;

/** Fields whose Setup path is intentionally not a picker. Each needs a class + reason. */
interface Exemption {
  readonly reason: string;
  readonly klass: "UPSTREAM" | "NO-LISTING" | "SCOPE" | "CONTRACT";
}

const EXEMPT: Readonly<Record<string, Exemption>> = {
  // ── UPSTREAM: produced by an earlier step / trigger at runtime ──────────
  "slack:update_message.ts": {
    klass: "UPSTREAM",
    reason:
      "A message timestamp comes from the Slack step that posted the message or the trigger that received it — never something an author browses for.",
  },
  "slack:delete_message.ts": {
    klass: "UPSTREAM",
    reason:
      "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
  },
  "slack:add_reaction.ts": {
    klass: "UPSTREAM",
    reason:
      "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
  },
  "slack:remove_reaction.ts": {
    klass: "UPSTREAM",
    reason:
      "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
  },
  "slack:pin_message.ts": {
    klass: "UPSTREAM",
    reason:
      "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
  },
  "slack:unpin_message.ts": {
    klass: "UPSTREAM",
    reason:
      "Message ts is wired from an earlier Slack step or the trigger that received the message — there is no meaningful browse list of timestamps.",
  },
  "slack:cancel_scheduled_message.scheduledMessageId": {
    klass: "UPSTREAM",
    reason:
      "The scheduled-message id is returned by the schedule_message step that created it; Slack has no browse list of pending scheduled messages for a picker.",
  },
  "stripe:capture_payment_intent.paymentIntentId": {
    klass: "UPSTREAM",
    reason:
      "Payment intents are created by an earlier Stripe step or delivered by a webhook; they are per-transaction runtime values, not a catalog to browse.",
  },
  "stripe:confirm_payment_intent.paymentIntentId": {
    klass: "UPSTREAM",
    reason:
      "Payment intents are created by an earlier Stripe step or delivered by a webhook; they are per-transaction runtime values, not a catalog to browse.",
  },
  "stripe:find_payment_intent.paymentIntentId": {
    klass: "UPSTREAM",
    reason:
      "A lookup by an id supplied at runtime from an earlier step or a webhook payload — the whole point of the action is resolving a value it is given.",
  },
  "stripe:create_refund.chargeId": {
    klass: "UPSTREAM",
    reason:
      "Charge ids arrive from the payment step or the Stripe webhook payload that reported the charge.",
  },
  // ── CONTRACT: a builder/runtime contract blocks it today ────────────────
  "github:create_issue.milestone": {
    klass: "CONTRACT",
    reason:
      "Runtime schema stores z.number(); the ActionMeta contract forbids optionsSource on `number` fields and a combobox commits a string. Needs a coerce-to-number schema change (a slice that may touch schemas).",
  },
  // RESOLVERS-2 retired the `shopify:update_inventory.location_id` SCOPE
  // exemption: `read_locations` is now requested as an OPTIONAL manifest
  // scope (optional ⇒ no forced reconnect for existing stores), and the
  // field is a real `shopify:locations` picker. Tokens predating the scope
  // get PROVIDER_REAUTH_REQUIRED → Reconnect, not a broken empty box.
  // ── NO-LISTING / deliberate product decisions ───────────────────────────
  "google-analytics:send_event.apiSecret": {
    klass: "NO-LISTING",
    reason:
      "V2 decision D-GA1: the Measurement Protocol api_secret is NEVER read or surfaced by ChainReact; paste-only by design.",
  },
  "mailchimp:unsubscribe_subscriber.emailAddress": {
    klass: "CONTRACT",
    reason:
      "The action's V1 field names (listId/emailAddress) can't feed the members resolver, which reads deps.audience_id — SchemaForm keys deps by the parent field NAME. Needs a schema rename (breaks the handler) or a shared-resolver change.",
  },
  "gmail:get_attachment.messageId": {
    klass: "UPSTREAM",
    reason:
      "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
  },
  "gmail:add_label.messageId": {
    klass: "UPSTREAM",
    reason:
      "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
  },
  "gmail:remove_label.messageId": {
    klass: "UPSTREAM",
    reason:
      "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
  },
  "gmail:mark_as_read.messageId": {
    klass: "UPSTREAM",
    reason:
      "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
  },
  "gmail:mark_as_unread.messageId": {
    klass: "UPSTREAM",
    reason:
      "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
  },
  "gmail:archive_email.messageId": {
    klass: "UPSTREAM",
    reason:
      "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
  },
  "gmail:delete_email.messageId": {
    klass: "UPSTREAM",
    reason:
      "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
  },
  "gmail:get_attachment.attachmentId": {
    klass: "UPSTREAM",
    reason:
      "Attachment ids only exist inside a specific message payload delivered by the trigger / fetch step.",
  },
  "gmail:reply_to_email.originalMessageId": {
    klass: "UPSTREAM",
    reason:
      "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
  },
  "gmail:create_draft_reply.originalMessageId": {
    klass: "UPSTREAM",
    reason:
      "Message ids are produced by the step that sent the message or by the trigger that received it — there is no meaningful browse list, and mapping from that step is the correct UX.",
  },
  "microsoft-outlook:reply_to_email.emailId": {
    klass: "UPSTREAM",
    reason:
      "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
  },
  "microsoft-outlook:forward_email.emailId": {
    klass: "UPSTREAM",
    reason:
      "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
  },
  "microsoft-outlook:get_attachment.emailId": {
    klass: "UPSTREAM",
    reason:
      "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
  },
  "microsoft-outlook:add_categories.emailId": {
    klass: "UPSTREAM",
    reason:
      "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
  },
  "microsoft-outlook:move_email.emailId": {
    klass: "UPSTREAM",
    reason:
      "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
  },
  "microsoft-outlook:delete_email.emailId": {
    klass: "UPSTREAM",
    reason:
      "Outlook message ids come from the trigger that received the mail or the step that sent it; Graph has no user-facing browse list for the builder to offer.",
  },
  "microsoft-teams:reply_to_channel_message.messageId": {
    klass: "UPSTREAM",
    reason:
      "The parent message id comes from the Teams step/trigger that produced the message being replied to.",
  },
  "google-calendar:update_event.eventId": {
    klass: "UPSTREAM",
    reason:
      "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
  },
  "google-calendar:delete_event.eventId": {
    klass: "UPSTREAM",
    reason:
      "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
  },
  "google-calendar:add_attendees.eventId": {
    klass: "UPSTREAM",
    reason:
      "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
  },
  "microsoft-outlook-calendar:update_event.eventId": {
    klass: "UPSTREAM",
    reason:
      "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
  },
  "microsoft-outlook-calendar:delete_event.eventId": {
    klass: "UPSTREAM",
    reason:
      "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
  },
  "microsoft-outlook-calendar:add_attendees.eventId": {
    klass: "UPSTREAM",
    reason:
      "Calendar event ids come from the create_event step or the event_changed trigger; a browse list of every event in a calendar is unbounded and time-scoped, so mapping is the honest UX.",
  },
  "slack:download_file.fileId": {
    klass: "UPSTREAM",
    reason:
      "Slack file ids arrive from the file_shared trigger or an upload step; files.list would be an unbounded workspace dump rather than a useful picker.",
  },
  "slack:get_file_info.fileId": {
    klass: "UPSTREAM",
    reason:
      "Slack file ids arrive from the file_shared trigger or an upload step; files.list would be an unbounded workspace dump rather than a useful picker.",
  },
  // RESOLVERS-2 retired the three `shopify:*.order_id` UPSTREAM exemptions.
  // The premise ("an order picker would list an unbounded, constantly-changing
  // history") didn't survive contact with the API: `GET /orders.json` is a
  // supported list endpoint on the already-required `read_orders` scope, and
  // ONE bounded page of the 50 most recent orders, labeled
  // `#1001 - Jane Smith - 84.20 USD - paid`, is exactly what a merchant needs
  // when hand-picking an order. Being ALSO commonly mapped from an order
  // webhook never justified withholding the picker — `allowManualEntry: true`
  // keeps {{...}} mapping and pasted ids working unchanged.
  "stripe:create_refund.paymentIntentId": {
    klass: "UPSTREAM",
    reason:
      "Payment intents are created by an earlier step or delivered by a Stripe webhook.",
  },
  "notion:create_comment.discussionId": {
    klass: "UPSTREAM",
    reason:
      "A discussion id identifies an existing comment thread and is only obtainable from a comment payload / earlier step.",
  },
  "google-analytics:send_event.clientId": {
    klass: "NO-LISTING",
    reason:
      "The GA client id is generated by the customer's own site/app at runtime and supplied per event — it is not a ChainReact-discoverable resource.",
  },
  "google-analytics:send_event.userId": {
    klass: "NO-LISTING",
    reason:
      "The GA user id is the customer's own identifier for their end user, supplied per event at runtime.",
  },
  "stripe:create_checkout_session.clientReferenceId": {
    klass: "NO-LISTING",
    reason:
      "A free reference the author chooses to correlate the session with their own system — not a Stripe resource to browse.",
  },
  // RESOLVERS-2 retired the `shopify:update_product_variant.variant_id` SCOPE
  // exemption. The "needs a product-scoped UI parent" premise was wrong: the
  // products list can return each product's variants INLINE
  // (`GET /products.json?fields=id,title,variants`), so one bounded call backs
  // a FLAT `shopify:variants` picker with product-qualified labels
  // ("Acme Tee - Small / Blue - SKU ABC-1 - 19.00"). No parent field, and no
  // runtime schema change, was needed after all.
  "shopify:update_inventory.inventory_item_id": {
    klass: "UPSTREAM",
    reason:
      "Re-classified in RESOLVERS-2 (was SCOPE, citing a product-parent gap + read_locations — both now resolved, and neither was ever this field's real blocker). An inventory item is a variant's invisible inventory record: it has no name, no SKU of its own, and no merchant-facing identity anywhere in the Shopify admin, and Shopify exposes no standalone listing (/inventory_items.json requires an ids= filter you can only get from variants you already hold). A picker could only show the PARENT VARIANT's label — the variants picker wearing a different id, which would silently mis-target. The real path is mapping {{step.inventoryItemId}} from an upstream Update / Create Product Variant step, which both emit it.",
  },
};

interface Offender {
  readonly key: string;
  readonly label: string;
}

function collect(): Offender[] {
  const registeredSources = new Set(listOptionsResolvers().map((r) => r.source));
  const offenders: Offender[] = [];

  const check = (metaKey: string, field: FieldMeta): void => {
    // Only plain typed inputs can strand a user on an opaque id. Pickers,
    // structured editors, temporal/boolean/number controls are all fine.
    if (field.type !== "text") return;
    if (!RESOURCE_NAME_RE.test(field.name)) return;
    const key = `${metaKey}.${field.name}`;
    if (EXEMPT[key]) return;
    offenders.push({ key, label: field.label });
  };

  for (const meta of listAllActionMetas()) {
    for (const field of meta.fields) check(meta.key, field);
  }
  for (const meta of listAllTriggerMetas()) {
    for (const field of meta.fields) check(meta.key, field);
  }

  // A wired picker must point at a REGISTERED resolver (a dangling source is a
  // dead dropdown — worse than text). The dedicated reference-integrity guard
  // covers this too; asserted here so this file tells the whole story.
  for (const meta of [...listAllActionMetas(), ...listAllTriggerMetas()]) {
    for (const field of meta.fields) {
      if (field.optionsSource && !registeredSources.has(field.optionsSource)) {
        offenders.push({
          key: `${meta.key}.${field.name}`,
          label: `points at unregistered source '${field.optionsSource}'`,
        });
      }
    }
  }
  return offenders;
}

describe("resource-field discovery coverage (RESOLVERS-1)", () => {
  it("sanity: the registry exposes a non-trivial field surface", () => {
    const total =
      listAllActionMetas().reduce((n, m) => n + m.fields.length, 0) +
      listAllTriggerMetas().reduce((n, m) => n + m.fields.length, 0);
    expect(total).toBeGreaterThan(1000);
  });

  it("no builder-visible resource field is plain Setup text without a resolver or a documented exemption", () => {
    const offenders = collect();
    if (offenders.length > 0) {
      const lines = offenders.map((o) => `  • ${o.key} — "${o.label}"`).join("\n");
      throw new Error(
        `${offenders.length} resource field(s) still make users supply a provider identifier by hand:\n` +
          lines +
          "\n\nEither wire a registered `optionsSource` picker (allowManualEntry stays on for " +
          "power users), or add a documented exemption to EXEMPT in this file with one of the " +
          "four classes (UPSTREAM / NO-LISTING / SCOPE / CONTRACT) and a real reason. " +
          "Do not exempt a field just to make this test pass.",
      );
    }
    expect(offenders).toEqual([]);
  });

  it("every exemption carries a real reason (no empty placeholders)", () => {
    for (const [key, ex] of Object.entries(EXEMPT)) {
      expect(`${key}:${ex.reason.length > 40}`).toBe(`${key}:true`);
      expect(["UPSTREAM", "NO-LISTING", "SCOPE", "CONTRACT"]).toContain(ex.klass);
    }
  });

  it("exemptions stay live: every exempted field still exists in the registry", () => {
    // Stops the ledger rotting into stale entries that hide real regressions.
    const live = new Set<string>();
    for (const meta of [...listAllActionMetas(), ...listAllTriggerMetas()]) {
      for (const field of meta.fields) live.add(`${meta.key}.${field.name}`);
    }
    const dead = Object.keys(EXEMPT).filter((k) => !live.has(k));
    expect(dead).toEqual([]);
  });

});
