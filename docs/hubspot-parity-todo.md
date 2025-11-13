# HubSpot Parity TODO (Zapier / Make)

## High Priority

1. **Create Ticket Parity** ✅
   - UI + backend now send `hs_ticket_status`.
   - Attachments uploaded via workflow file field are pushed to the HubSpot Files API and associated to the ticket.
   - Dynamic custom property map flows through the action payload so any ticket property can be set.

2. **Get Deals Enhancements** ✅
   - Builder now supports cursor-based pagination with `after` input, `nextCursor`, and `hasMore` outputs.
   - Added advanced filter UI to compose property/operator/value rules (AND logic) plus legacy quick filters.
   - Sorting controls let you pick any deal property and direction, mirroring HubSpot search API capability.

3. **Update Contact Parity** ✅
   - Added a find helper that lets you pick from the dropdown, look up by email (with optional auto-create), or supply the contact ID directly.
   - Added the same custom property map used in Create Contact so any HubSpot contact property can be updated inline.

## Trigger Improvements

4. **Ticket trigger payloads** ✅
   - Ticket-created/updated/deleted triggers now expose `hs_ticket_status` plus a full `properties` object so downstream nodes can map custom fields without spelunking.
   - Added regression coverage exercising `shouldSkipByConfig` to ensure pipeline/priority filters are honored even when values only exist inside the `properties` blob.

5. **Engagement triggers** (note/task/call/meeting) ✅
   - All four triggers now expose owner names plus a `properties` blob alongside the existing associated IDs so custom engagement fields are immediately accessible.
   - Webhook utility normalizes those fields (and association IDs) and logging still samples the first payload so we can verify delivery in staging.
   - Added Jest coverage ensuring owner/priority/direction/outcome filters pass even when the values only exist inside the raw `properties` payload.

6. **Form submission trigger** ✅
   - Webhook handler now flattens every submitted field into `fieldValues` while still exposing the raw array; contact email is inferred from field data when HubSpot does not include it.
   - Sample logging was already enabled for HubSpot webhooks, so we continue to capture payloads in staging to verify delivery and spot missing subscription types.

## Tests / Monitoring

7. **Regression coverage** ✅
   - Jest suite (`__tests__/workflows/v2/hubspotWebhookUtils.test.ts`) now mocks ticket, engagement, and form payloads so we exercise every filter path and flattened field without hitting the live API.

8. **Monitoring** ✅
   - Unsupported HubSpot webhook types are now logged once (per subscription) and persisted to the `webhook_events` table with structured metadata so we can alert on new subscription names without combing through stdout logs.

## Stretch

9. **Global property picker UX** ✅
   - HubSpot property pickers now display the property description (and group) inline in the dropdown, making it easier to identify the correct field without leaving the builder.

10. **Advanced pagination for “Get” actions** ✅
    - Contacts, companies, deals, and tickets all support the same cursor-based pagination inputs/outputs (`after`, `nextCursor`, `hasMore`, `paging`) so incremental syncs can resume where they left off.
