import type { OptionsResolver, OptionsResolverResult } from "@/services/options/types";
import { OptionsResolverError } from "@/services/options/types";
import { requireHubspotIntegration } from "./_shared";
import { resolveHubspotPropertyNameOptions } from "./propertyNames";

/**
 * `hubspot:subscription_properties` — RESOLVERS-4.
 *
 * Backs the per-row `propertyName` picker on the `hubspot:webhook_received`
 * trigger's `subscriptions` object-list, closing the last common-path gap in
 * the builder config-UX pass: a business user picked "Deal property changed"
 * and was then asked to hand-type a HubSpot INTERNAL property name (`amount`,
 * `dealstage`, `hs_lead_status`) — a value that only exists in HubSpot's admin
 * UI or API docs.
 *
 * ── Why this resolver exists at all ───────────────────────────────────────
 * Six per-object property resolvers already ship (`hubspot:contact_properties`
 * / `company_` / `deal_` / `ticket_` / `product_` / `line_item_properties`).
 * None of them could be wired here, because WHICH list is correct is decided by
 * that ROW's own `eventType`, and different rows in the same trigger watch
 * different object types — so no single registered source is right for every
 * row, and a field can only name ONE `optionsSource`.
 *
 * The resolution is to move the choice from the BUILDER to the SERVER. The
 * field names one stable source; this resolver reads the row's `eventType` out
 * of `ctx.deps` (delivered by the contract's row-local `dependsOnRow`, see
 * ObjectListItemFieldSchema) and dispatches to the right HubSpot object type
 * per request. The builder never needs "a different source per row" — one
 * source, one dep, resolved server-side.
 *
 * Dispatch table (`*.propertyChange` prefix → HubSpot object type):
 *   contact.propertyChange → contacts
 *   company.propertyChange → companies
 *   deal.propertyChange    → deals
 *   ticket.propertyChange  → tickets
 * (The four `*.propertyChange` members of HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES —
 * the only event types on which HubSpot scopes a subscription per-property, and
 * the only ones where the meta makes `propertyName` visible.)
 *
 * ── Non-propertyChange / unrecognized eventType → EMPTY, not an error ─────
 * A dep the resolver cannot map (`contact.creation`, or a future/typo'd type)
 * returns `{ items: [], hasMore: false }`.
 *
 * The honest reading: this is not a failure state a user can be in and act on.
 * The meta gates `propertyName` behind
 * `visibleWhen: { field: "eventType", valueEndsWith: ".propertyChange" }`, so
 * on a `creation` / `deletion` row the picker is not rendered and never asks
 * for options. Reaching here with such a dep means a direct route call, not a
 * user. MISSING_DEPENDENCY would be an outright lie — the dep IS present, the
 * user DID choose an event — and would render "Select Event first" underneath a
 * populated Event picker. An empty list says exactly what is true ("no
 * properties to offer for this event") and is what `hubspot:deal_stages`
 * already does for an unresolvable dep value (a deleted pipeline id).
 * A genuinely ABSENT dep still throws MISSING_DEPENDENCY below — that one IS
 * "you haven't chosen the event yet".
 *
 * Everything else — mapping (value = INTERNAL property name, label = display
 * label, description = internal name when it differs), portal-hidden filtering,
 * `ctx.q` matching label OR internal name, alpha sort, `hasMore: false`, and
 * 403 → PROVIDER_REAUTH_REQUIRED — is not reimplemented here: it calls the same
 * `resolveHubspotPropertyNameOptions` body the six per-object resolvers call,
 * so per-row behavior is identical to per-field behavior by construction.
 *
 * Scopes: as `hubspot:{contact,company,deal,ticket}_properties` — schema-read
 * or object-read, already in the manifest. No property VALUES are read;
 * definitions only. The field keeps `allowManualEntry`, so a power user (or an
 * upstream `{{...}}` mapping) can still commit a raw internal name.
 */

const PROPERTY_CHANGE_SUFFIX = ".propertyChange";

interface PropertyTarget {
  /** HubSpot object type path segment. */
  readonly objectType: string;
  /** Noun for the sanitized PROVIDER_ERROR copy. */
  readonly what: string;
}

/** Object prefix of a `*.propertyChange` subscription type → object type. */
const TARGET_BY_OBJECT_PREFIX: Readonly<Record<string, PropertyTarget>> = {
  contact: { objectType: "contacts", what: "contact properties" },
  company: { objectType: "companies", what: "company properties" },
  deal: { objectType: "deals", what: "deal properties" },
  ticket: { objectType: "tickets", what: "ticket properties" },
};

/**
 * Map a subscription eventType to the object type whose properties it watches.
 * `undefined` for anything that is not a recognized `*.propertyChange` type.
 * Pure + total — no throwing on unknown input (see the empty-list rationale).
 */
export function targetForSubscriptionEventType(
  eventType: string,
): PropertyTarget | undefined {
  if (!eventType.endsWith(PROPERTY_CHANGE_SUFFIX)) return undefined;
  const prefix = eventType.slice(0, -PROPERTY_CHANGE_SUFFIX.length);
  return TARGET_BY_OBJECT_PREFIX[prefix];
}

export const hubspotSubscriptionPropertiesResolver: OptionsResolver = {
  source: "hubspot:subscription_properties",
  provider: "hubspot",
  requiresIntegration: true,
  requiredDeps: ["eventType"],
  async resolve(ctx): Promise<OptionsResolverResult> {
    // Integration first: "reconnect HubSpot" is the actionable answer even when
    // the dep is one we can't map, and it mirrors the per-object resolvers.
    requireHubspotIntegration(ctx);

    const eventType = ctx.deps.eventType;
    if (typeof eventType !== "string" || eventType.length === 0) {
      // Defense-in-depth — the route's requiredDeps guard fires first.
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Choose the HubSpot event first.",
      );
    }

    const target = targetForSubscriptionEventType(eventType);
    // Not a property-change event (or an unrecognized type) → nothing to
    // offer. Hidden by `visibleWhen` in the builder anyway.
    if (!target) return { items: [], hasMore: false };

    return resolveHubspotPropertyNameOptions({
      ctx,
      objectType: target.objectType,
      what: target.what,
    });
  },
};
