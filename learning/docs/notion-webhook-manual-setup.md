# Notion Webhook Manual Setup Guide

## Key Discovery

**Notion webhooks CANNOT be created programmatically via API.** They must be created manually through the Notion integration UI.

## Background

On 2025-10-17, we discovered that Notion does not provide a `POST /v1/webhooks` API endpoint for programmatic webhook creation, despite having endpoints for other operations. The Notion API documentation only describes manual webhook setup through their integration dashboard.

### Error That Led to Discovery

When attempting to create webhooks programmatically:
```
Notion API error: 400 - {"object":"error","status":400,"code":"invalid_request_url","message":"Invalid request URL."}
```

This error was misleading - the issue wasn't the webhook URL being invalid, but rather that the API endpoint itself doesn't exist.

## How Notion Webhooks Work

### Setup Process (Manual)

1. User creates an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. In integration settings, navigate to "Webhooks" tab
3. Click "+ Create a subscription"
4. Enter webhook URL (must be HTTPS and publicly accessible)
5. Select event types to subscribe to (e.g., `page.created`, `page.content_updated`)
6. Choose what to subscribe to:
   - For 2025-09-03 API: Subscribe to `data_source_id` (recommended)
   - For older APIs: Subscribe to `database_id`
7. Notion sends a verification token to your endpoint
8. Copy the token and enter it in the verification dialog
9. Webhook subscription is now active

### Verification Flow

When Notion sends the initial verification request:

```json
{
  "type": "url_verification",
  "token": "verification-token-here",
  "challenge": "challenge-string-here"
}
```

Your endpoint must:
1. Store the token for manual verification
2. Respond with `{ "challenge": "challenge-string-here" }`

The user then manually enters the token in Notion's UI to complete verification.

## Implementation in ChainReact

### NotionTriggerLifecycle

The lifecycle manager handles this by:

1. **On Activation:**
   - Stores trigger configuration in `trigger_resources` table
   - Sets status to `pending_setup` (not `active`)
   - Stores setup instructions in metadata
   - Includes webhook URL, event types, and target (data source or database)

2. **On Deactivation:**
   - Only cleans up internal tracking
   - Does NOT attempt to delete webhooks via API (not supported)
   - Logs reminder for user to manually delete webhook in Notion UI

3. **Health Check:**
   - Checks if status is still `pending_setup`
   - Returns unhealthy if manual setup hasn't been completed
   - Provides message directing user to setup instructions

### Webhook Handler

`app/api/webhooks/notion/route.ts` handles verification:

```typescript
if (body.type === 'url_verification') {
  // Store verification token in database
  await supabase.from('webhook_events').insert({
    provider: 'notion',
    event_type: 'VERIFICATION_TOKEN',
    event_data: {
      token: body.token,
      challenge: body.challenge
    }
  })

  // Respond with challenge
  return jsonResponse({ challenge: body.challenge })
}
```

### User Experience Flow

1. **User activates workflow with Notion trigger**
2. **Toast notification appears:**
   - Title: "Notion webhook setup required"
   - Description: "To complete activation, configure the webhook in your Notion integration settings."
   - Action button: "Open Notion Integrations" → opens notion.so/my-integrations
3. **User follows setup instructions:**
   - Instructions stored in `trigger_resources.metadata.setupInstructions`
   - Includes webhook URL, event types, and target database/data source
4. **Verification token retrieval:**
   - Token stored in `webhook_events` table with `event_type = 'VERIFICATION_TOKEN'`
   - User queries database to get token
   - Or check Vercel logs (if console.log appears)
5. **User enters token in Notion UI**
6. **Webhook is now active and will trigger workflows**

## Database Schema

### trigger_resources

```sql
{
  workflow_id: uuid,
  user_id: uuid,
  node_id: string,
  provider_id: 'notion',
  trigger_type: 'notion_trigger_new_page',
  resource_type: 'webhook',
  external_id: '${workflowId}-${nodeId}', -- Internal ID, not Notion's webhook ID
  status: 'pending_setup', -- Changed to 'active' after manual setup
  config: {
    workspace: string,
    database: string,
    dataSourceId: string -- For 2025-09-03 API
  },
  metadata: {
    webhookUrl: string,
    apiVersion: '2025-09-03',
    eventTypes: ['page.created'],
    setupInstructions: {
      step1: "Visit https://www.notion.so/my-integrations",
      step2: "Select your ChainReact integration",
      // ... more steps
    }
  }
}
```

### webhook_events (for verification token)

```sql
{
  provider: 'notion',
  event_type: 'VERIFICATION_TOKEN',
  event_data: {
    token: string,
    challenge: string,
    timestamp: string
  }
}
```

## Notion API Version 2025-09-03

### Important Changes

1. **Data Sources vs Databases:**
   - Databases can now have multiple data sources
   - Subscribe to `data_source_id` instead of `database_id` for more granular control
   - Our code auto-detects the data source from the database

2. **New Event Types:**
   - `data_source.content_updated` (replaces `database.content_updated`)
   - `data_source.schema_updated` (replaces `database.schema_updated`)
   - `data_source.created`, `data_source.moved`, `data_source.deleted`, `data_source.undeleted` (new)

3. **Webhook Versioning:**
   - Webhooks can be created with different API versions
   - Existing webhooks need manual upgrade through UI
   - Event payloads differ between versions

## Gotchas

1. **No DELETE endpoint either:**
   - Can't programmatically delete webhooks
   - Users must manually delete from Notion integration UI
   - Always remind users to clean up webhooks when deactivating workflows

2. **URL must be verified before use:**
   - Even with programmatic API (if it existed), URL needs manual verification first
   - This is a one-time process per URL
   - Can't change URL after verification - must delete and recreate subscription

3. **Public vs Internal Integrations:**
   - Only affects who can install the integration
   - Both types require manual webhook setup
   - Public integrations don't enable programmatic webhook creation

4. **Webhook URL requirements:**
   - Must be HTTPS
   - Must be publicly accessible
   - No localhost URLs allowed

## Critical Implementation Details

### Event Type Mapping (Required!)

Notion sends webhook events with their own event type names (e.g., `page.created`), but our workflow nodes use internal trigger type names (e.g., `notion_trigger_new_page`). The webhook processor MUST map these:

```typescript
// In lib/webhooks/processor.ts
const notionEventMap: Record<string, string[]> = {
  'notion_trigger_new_page': ['page.created'],
  'notion_trigger_page_updated': ['page.content_updated', 'page.property_values_updated'],
  'notion_trigger_comment_added': ['comment.created']
}
```

**Without this mapping, workflows won't trigger even though webhooks are received!**

### Webhook Subscription Setup

**Complete step-by-step process that works:**

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Select your ChainReact integration
3. Click "Webhooks" tab
4. Click "+ Create a subscription"
5. **Webhook URL:** `https://chainreact.app/api/webhooks/notion`
6. **API Version:** `2025-09-03` (important!)
7. **Subscribed events:**
   - Under "Page" section: Check `Page created` (for new page triggers)
   - Do NOT select old `database.content_updated` events (not supported in 2025-09-03)
8. **Filter (optional):** Can filter to specific database/data source
9. Click verification token when it arrives
10. Enter token in Notion UI
11. Subscription is now active!

### Common Issues and Solutions

**Issue 1: "Event types database.content_updated, database.schema_updated are not supported in API version 2025-09-03"**
- **Cause:** Selected old database events instead of page/data source events
- **Solution:** Uncheck database events, only select page/data source/comment events

**Issue 2: Webhook received but workflow doesn't trigger**
- **Cause:** Event type mapping missing in processor
- **Solution:** Ensure `lib/webhooks/processor.ts` has Notion event type mapping (see above)

**Issue 3: No logs appearing when creating pages**
- **Cause:** Webhook subscription not active or not subscribed to correct database
- **Solution:** Verify subscription status is "Active" and filter matches your database

**Issue 4: Database constraint violation with 'pending_setup' status**
- **Cause:** Tried to use status not in allowed list
- **Solution:** Use 'active' status - webhook works once manually set up regardless

## Future Considerations

1. **Status Updates:**
   - Trigger resources use 'active' status from the start
   - Could add health checks to verify webhook subscription is still active in Notion

2. **Setup Verification:**
   - Could add endpoint to test if webhook is working
   - Send test event from Notion and verify it arrives

3. **Better UX:**
   - In-app wizard to guide users through manual setup
   - Video/screenshots showing each step
   - Auto-copy webhook URL and token to clipboard

4. **Monitoring:**
   - Alert if webhook subscription becomes inactive/paused
   - Alert if webhook stops receiving events
   - Auto-remind users to complete manual setup if trigger_resources exist but no events received

## References

- [Notion Webhooks Documentation](https://developers.notion.com/reference/webhooks)
- [Notion API 2025-09-03 Upgrade Guide](https://developers.notion.com/docs/upgrade-guide-2025-09-03)
- [Notion API 2025-09-03 FAQs](https://developers.notion.com/docs/upgrade-faqs-2025-09-03)

## Related Files

- [lib/triggers/providers/NotionTriggerLifecycle.ts](../../lib/triggers/providers/NotionTriggerLifecycle.ts)
- [app/api/webhooks/notion/route.ts](../../app/api/webhooks/notion/route.ts)
- [components/workflows/WorkflowsContent.tsx](../../components/workflows/WorkflowsContent.tsx) (lines 383-398)
