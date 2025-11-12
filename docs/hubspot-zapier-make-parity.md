# HubSpot Node Parity Snapshot (Zapier & Make)

_Last updated: 2024-03-17_

This document compares a representative set of HubSpot nodes in our builder against the equivalent Zapier/Make modules. The goal is to surface feature gaps so we can close them before claiming parity.

## Legend

- ✅ = feature implemented (or intentionally not required)
- ⚠️ = partially implemented / degraded UX
- ❌ = missing

## Actions

### Create Ticket (hubspot_action_create_ticket)

| Capability | Ours | Zapier / Make | Notes |
|-------------|------|---------------|-------|
| Subject, description, pipeline, stage | ✅ | ✅ | Required fields align. |
| Priority & category picklists | ✅ | ✅ | Same options, but we don’t expose `hs_ticket_status`. |
| Owner assignment | ✅ | ✅ | Works via `hubspot_owners`. |
| Contact / company / deal association | ✅ | ✅ | Multi-lookup parity. |
| Source type picker | ✅ | ✅ | Both expose email/phone/chat/form. |
| Attachments / file uploads | ❌ | ⚠️ | Zapier supports attachments via file array; we currently have no upload slot. |
| Custom property injection | ❌ | ⚠️ | Zapier/Make allow arbitrary ticket properties; we only expose the fixed set. |

**Gap summary**: Missing `hs_ticket_status`, attachments, and custom-property injection keep us from parity.

### Get Deals (hubspot_action_get_deals)

| Capability | Ours | Zapier / Make | Notes |
|-------------|------|---------------|-------|
| Limit / pagination | ⚠️ | ✅ | We only allow a numeric limit; no pagination cursor or incremental polling. |
| Filter by property | ⚠️ | ✅ | UI allows multi-select but requires a single “filter value” string; Zapier/Make let you specify key/value pairs, operators, and ranges. |
| Sort order / date range | ❌ | ✅ | Other platforms expose “Sort by close date” or updated-since filters; ours doesn’t. |
| Property selection | ✅ | ✅ | Multi-select parity, but our picker doesn’t show property descriptions the way Zapier does. |

**Gap summary**: Need richer filtering (operators, multi-value JSON input) and pagination controls to match Zapier/Make.

### Update Contact (hubspot_action_update_contact)

| Capability | Ours | Zapier / Make | Notes |
|-------------|------|---------------|-------|
| Basic fields (name, phone, etc.) | ✅ | ✅ | Same behaviour. |
| Custom property updates | ⚠️ | ✅ | We allow dynamic property selection but only via dynamic_properties component; Zapier lets you inline arbitrary key/value pairs. |
| Duplicate handling | ⚠️ | ✅ | Create action supports duplicate update/skip, but update action doesn’t surface `id/email` search options like Zapier’s “Find or Create”. |

## Triggers

### Ticket Created / Updated / Deleted

| Capability | Ours | Zapier / Make | Notes |
|-------------|------|---------------|-------|
| Webhook delivery | ✅ | ✅ | Lifecycle updated to subscribe to `ticket.*`. |
| Pipeline / priority filters | ⚠️ | ✅ | Create trigger offers pipeline/priority filters, but we don’t yet validate they work (needs payload tests). Zapier filters server-side. |
| Full property payload | ⚠️ | ✅ | We forward entire `properties` blob, but output schema only advertises core fields. Zapier surfaces every property as a mapped output. |

### Engagement Triggers (note/task/call/meeting)

| Capability | Ours | Zapier / Make | Notes |
|-------------|------|---------------|-------|
| Webhook support | ⚠️ | ✅ | Lifecycle/receiver now map events, but we haven’t proven HubSpot private apps emit them. Need staging verification. |
| Filters (owner, outcome) | ⚠️ | ✅ | UI exposes filters; backend filtering just landed but lacks tests. |
| Payload richness | ⚠️ | ✅ | Output schema covers key fields yet we don’t expose attachments or extended metadata Zapier/Make surface. |

### Form Submission Trigger

| Capability | Ours | Zapier / Make | Notes |
|-------------|------|---------------|-------|
| Webhook coverage | ⚠️ | ✅ | Added mapping to `form.submission`, but HubSpot private apps may not emit this event; Zapier uses Marketing Forms API. Need confirmation/polling fallback. |
| Filter by form | ✅ | ✅ | Works via `formId`, once event is confirmed. |
| Submission data (fields array) | ⚠️ | ✅ | We dump raw `fields` object; Zapier flattens each field as a discrete output. |

## Recommendations

1. **Exercise the new webhook events** in staging and log payload samples (already wired); confirm HubSpot private-app webhooks actually deliver engagement/form events. If not, design a polling or public-app path.
2. **Add regression tests** for `shouldSkipByConfig` to ensure pipeline/owner filters work for every trigger.
3. **Enhance action schema parity**:
   - `Create Ticket`: expose `hs_ticket_status`, allow attachments, and add a custom-property map similar to Zapier’s field mapping.
   - `Get Deals`: add operator-aware filters (e.g., `amount > X`, date ranges), pagination cursor, and sort controls.
   - `Update Contact`: add “Find by email/ID” + dynamic property map akin to Zapier’s custom fields.
4. **Flatten trigger outputs** by auto-mapping HubSpot properties into the output schema (Zapier surfaces every available property; we only include a handful plus a raw blob).

Once these items land we’ll have functional parity for the most commonly used HubSpot modules across Zapier/Make and can expand the comparison to secondary nodes (line items, workflows, etc.).
