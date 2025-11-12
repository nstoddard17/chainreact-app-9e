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

5. **Engagement triggers** (note/task/call/meeting)
   - Capture real webhook payloads in staging (logs already added) and confirm HubSpot sends them.
   - Flatten outputs (owner name, associated IDs) similar to Zapier.
   - Add regression tests for owner/outcome filters.

6. **Form submission trigger**
   - Verify webhook delivery; if not supported, build a fallback via HubSpot Forms API polling filtered by `formId`.
   - Flatten form fields (expose each field as key/value outputs like Zapier).

## Tests / Monitoring

7. **Regression coverage**
   - Add Jest tests for webhook filter logic per trigger type.
   - Add integration tests (mock payloads) for ticket + engagement events.

8. **Monitoring**
   - Add structured logging / alerting for unsupported HubSpot events so we know when new subscription types appear.

## Stretch

9. **Global property picker UX**
   - Show property descriptions/help text in the multi-select pickers (parity with Zapier’s UI).

10. **Advanced pagination for “Get” actions**
    - Standardize pagination helpers so contacts/companies/tickets also have cursor-based pagination and incremental sync options.
