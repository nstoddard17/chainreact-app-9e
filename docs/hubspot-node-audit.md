# HubSpot Node Audit

_Last updated: 2024-03-17_

This document tracks the current front-end vs. backend coverage for every HubSpot trigger and action implemented in the builder. It also highlights gaps that prevent full parity with platforms like Zapier or Make.

> **Scope:** Review node definitions under `lib/workflows/nodes/providers/hubspot/**`, confirm each node is registered with an execution handler or trigger lifecycle, and record outstanding issues.

## Summary

- **31 HubSpot actions** defined. All are now registered with backend handlers.
- **16 HubSpot triggers** defined, but only the 9 contact/company/deal variants are currently wired into the webhook lifecycle and receiver. Ticket & engagement triggers need backend wiring to actually fire.
- HubSpot dynamic contact action (`hubspot_action_create_contact_dynamic`) now uses the same backend handler as the classic create-contact node.

## Action Coverage

| Action Type | UI Definition | Backend Handler | Status |
|-------------|---------------|-----------------|--------|
| `hubspot_action_add_contact_to_list` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_action_add_to_workflow` | `lib/workflows/nodes/providers/hubspot/actions/workflowManagement.ts` | ✅ | OK |
| `hubspot_action_create_call` | `lib/workflows/nodes/providers/hubspot/actions/engagements.ts` | ✅ | OK |
| `hubspot_action_create_company` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_action_create_contact` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_action_create_contact_dynamic` | `lib/workflows/nodes/providers/hubspot/createContactDynamic.ts` | ✅ | OK |
| `hubspot_action_create_deal` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_action_create_line_item` | `lib/workflows/nodes/providers/hubspot/actions/lineItems.ts` | ✅ | OK |
| `hubspot_action_create_meeting` | `lib/workflows/nodes/providers/hubspot/actions/engagements.ts` | ✅ | OK |
| `hubspot_action_create_note` | `lib/workflows/nodes/providers/hubspot/actions/engagements.ts` | ✅ | OK |
| `hubspot_action_create_product` | `lib/workflows/nodes/providers/hubspot/actions/productManagement.ts` | ✅ | OK |
| `hubspot_action_create_task` | `lib/workflows/nodes/providers/hubspot/actions/engagements.ts` | ✅ | OK |
| `hubspot_action_create_ticket` | `lib/workflows/nodes/providers/hubspot/actions/tickets.ts` | ✅ | OK |
| `hubspot_action_get_companies` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_action_get_contacts` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_action_get_deal_pipelines` | `lib/workflows/nodes/providers/hubspot/actions/utilities.ts` | ✅ | OK |
| `hubspot_action_get_deals` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_action_get_forms` | `lib/workflows/nodes/providers/hubspot/actions/utilities.ts` | ✅ | OK |
| `hubspot_action_get_line_items` | `lib/workflows/nodes/providers/hubspot/actions/lineItems.ts` | ✅ | OK |
| `hubspot_action_get_owners` | `lib/workflows/nodes/providers/hubspot/actions/utilities.ts` | ✅ | OK |
| `hubspot_action_get_products` | `lib/workflows/nodes/providers/hubspot/actions/productManagement.ts` | ✅ | OK |
| `hubspot_action_get_tickets` | `lib/workflows/nodes/providers/hubspot/actions/tickets.ts` | ✅ | OK |
| `hubspot_action_remove_from_list` | `lib/workflows/nodes/providers/hubspot/actions/listManagement.ts` | ✅ | OK |
| `hubspot_action_remove_from_workflow` | `lib/workflows/nodes/providers/hubspot/actions/workflowManagement.ts` | ✅ | OK |
| `hubspot_action_remove_line_item` | `lib/workflows/nodes/providers/hubspot/actions/lineItems.ts` | ✅ | OK |
| `hubspot_action_update_company` | `lib/workflows/nodes/providers/hubspot/actions/updateCompany.ts` | ✅ | OK |
| `hubspot_action_update_contact` | `lib/workflows/nodes/providers/hubspot/actions/updateContact.ts` | ✅ | OK |
| `hubspot_action_update_deal` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_action_update_line_item` | `lib/workflows/nodes/providers/hubspot/actions/lineItems.ts` | ✅ | OK |
| `hubspot_action_update_product` | `lib/workflows/nodes/providers/hubspot/actions/productManagement.ts` | ✅ | OK |
| `hubspot_action_update_ticket` | `lib/workflows/nodes/providers/hubspot/actions/tickets.ts` | ✅ | OK |

**Notes**
- Dynamic node now shares the `createHubSpotContact` handler, which already supports `fieldMode`, `customProperties`, and `allProperties`.
- All other action nodes are registered either via `createExecutionContextWrapper` wrappers (for the `lib/workflows/actions/hubspot/*.ts` handlers) or direct legacy handlers (`createHubSpotCompany`, `updateHubSpotDeal`, etc.).

## Trigger Coverage

| Trigger Type | UI Definition | Webhook Mapping | Status |
|--------------|---------------|------------------|--------|
| `hubspot_trigger_call_created` | `lib/workflows/nodes/providers/hubspot/triggers/engagements.ts` | ⚠️ | Missing webhook mapping |
| `hubspot_trigger_company_created` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_trigger_company_deleted` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_trigger_company_updated` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_trigger_contact_created` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_trigger_contact_deleted` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_trigger_contact_updated` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_trigger_deal_created` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_trigger_deal_deleted` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_trigger_deal_updated` | `lib/workflows/nodes/providers/hubspot/index.ts` | ✅ | OK |
| `hubspot_trigger_form_submission` | `lib/workflows/nodes/providers/hubspot/triggers/forms.ts` | ⚠️ | Missing webhook mapping |
| `hubspot_trigger_meeting_created` | `lib/workflows/nodes/providers/hubspot/triggers/engagements.ts` | ⚠️ | Missing webhook mapping |
| `hubspot_trigger_note_created` | `lib/workflows/nodes/providers/hubspot/triggers/engagements.ts` | ⚠️ | Missing webhook mapping |
| `hubspot_trigger_task_created` | `lib/workflows/nodes/providers/hubspot/triggers/engagements.ts` | ⚠️ | Missing webhook mapping |
| `hubspot_trigger_ticket_created` | `lib/workflows/nodes/providers/hubspot/triggers/tickets.ts` | ✅ | OK |
| `hubspot_trigger_ticket_deleted` | `lib/workflows/nodes/providers/hubspot/triggers/tickets.ts` | ✅ | OK |
| `hubspot_trigger_ticket_updated` | `lib/workflows/nodes/providers/hubspot/triggers/tickets.ts` | ✅ | OK |

**Issues**
- Engagement and form triggers now have webhook mappings, but we still need to verify (and log) that HubSpot private apps actually emit those event types. If the API has limitations, we may need polling fallbacks.
- No automated tests yet for the new event payloads; regressions would be hard to detect.

## Parity with Zapier / Make

To match Zapier and Make we need:

1. **Validate engagement/form events:** confirm in a connected environment that the new webhook subscriptions deliver events (add structured logging + sample payload capture). If HubSpot private apps don’t emit those events, design a fallback (polling or public-app webhooks).
2. **Parity review vs. Zapier/Make:** now that all nodes are wired, compare their field sets/behaviors to Zapier/Make for representative flows (Create Ticket, Ticket Created, Get Deals). Document API/feature gaps.
3. **Automated tests:** add mock webhook payload tests to ensure filtering logic (owner/pipeline/formId) works and prevent regressions.

## Next Steps

1. **Capture/monitor webhook payloads** for the new event types and add logging so we can confirm real traffic.
2. **Add regression tests** for engagement/form triggers using mocked payloads (ensuring filters behave).
3. **Parity review**: pick a representative set (e.g., “Create Ticket”, “Get Deals”, “Ticket Created”) and verify field-level parity with Zapier/Make. Document gaps that require HubSpot API calls we don’t yet support.
4. **Monitoring**: add runtime alerts so we know when HubSpot delivers unsupported events and can iterate quickly.

Once these items are closed, we’ll have end-to-end coverage for every HubSpot node, putting us on firmer ground when doing the Zapier/Make comparison.
