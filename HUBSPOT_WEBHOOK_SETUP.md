# HubSpot Webhook Setup Guide

## Overview

HubSpot Private Apps have a **critical limitation**: webhook subscriptions **cannot be created programmatically via API**. They must be configured manually through the HubSpot Private App settings UI.

This is different from other integrations (like Microsoft Graph, Notion, Discord) where webhooks can be created dynamically per workflow.

## Architecture

### How HubSpot Webhooks Work

1. **Global Webhook**: One webhook URL configured in HubSpot Private App settings
2. **Event Types**: You select which event types to subscribe to (contact created, deal updated, etc.)
3. **Shared Across Workflows**: All workflows share the same webhook subscriptions
4. **Routing**: Our webhook receiver routes events to the appropriate workflows based on trigger type

### Comparison with Other Integrations

| Integration | Webhook Creation | Per-Workflow | Notes |
|------------|------------------|--------------|-------|
| Microsoft Graph | API | Yes | Dynamic subscription per workflow |
| Notion | API | Yes | Dynamic subscription per workflow |
| Discord | Manual | No | Bot receives all events, routes internally |
| **HubSpot** | **Manual** | **No** | **Private App limitation** |

## One-Time Setup

### Step 1: Create Private App

1. Go to HubSpot Settings → Integrations → Private Apps
2. Click "Create a private app"
3. Name it (e.g., "ChainReact Automation")
4. Go to "Scopes" tab and select:
   - `crm.objects.contacts.read`
   - `crm.objects.companies.read`
   - `crm.objects.deals.read`
   - (Add write scopes if needed for actions)

### Step 2: Configure Webhooks

1. In your Private App, go to the "Webhooks" section
2. Set **Target URL**: `https://www.chainreact.app/api/webhooks/hubspot`
3. Click "Subscribe to events" and select the event types you need:

#### Available Event Types

**Contacts:**
- `contact.creation` - When a contact is created
- `contact.propertyChange` - When contact properties are updated
- `contact.deletion` - When a contact is deleted

**Companies:**
- `company.creation` - When a company is created
- `company.propertyChange` - When company properties are updated
- `company.deletion` - When a company is deleted

**Deals:**
- `deal.creation` - When a deal is created
- `deal.propertyChange` - When deal properties are updated
- `deal.deletion` - When a deal is deleted

**Tickets:**
- `ticket.creation` - When a ticket is created
- `ticket.propertyChange` - When ticket properties are updated
- `ticket.deletion` - When a ticket is deleted

### Step 3: Get Access Token

1. In your Private App settings, find the "Access token" section
2. Click "Show token" and copy it
3. Add to Vercel environment variables as `HUBSPOT_PRIVATE_APP_TOKEN`

### Step 4: Deploy

1. Add environment variable to Vercel
2. Redeploy the application
3. Webhooks are now active!

## How Workflows Use Webhooks

### Workflow Activation

When a user activates a workflow with a HubSpot trigger:

1. **Verify Integration**: Check user has HubSpot connected
2. **Register Workflow**: Add entry to `trigger_resources` table
3. **No API Call**: We don't call HubSpot API (would fail with 404)
4. **Ready**: Workflow is ready to receive webhook events

### Event Routing

When HubSpot sends a webhook:

1. **Receive**: `POST /api/webhooks/hubspot` receives the event
2. **Parse**: Extract `subscriptionType` (e.g., `contact.creation`)
3. **Map**: Convert to our trigger type (e.g., `hubspot_trigger_contact_created`)
4. **Query**: Find all active workflows with that trigger type
5. **Execute**: Run each matching workflow with the event data

### Workflow Deactivation

When a user deactivates a workflow:

1. **Unregister**: Remove from `trigger_resources` table
2. **No API Call**: Webhook remains active in HubSpot
3. **Stop Routing**: Webhook receiver no longer routes events to this workflow

## Database Schema

```sql
-- trigger_resources table
CREATE TABLE trigger_resources (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider_id VARCHAR NOT NULL,      -- 'hubspot'
  trigger_type VARCHAR NOT NULL,     -- 'hubspot_trigger_contact_created'
  node_id VARCHAR NOT NULL,
  resource_type VARCHAR NOT NULL,    -- 'webhook_registration' (not 'webhook')
  external_id VARCHAR NOT NULL,      -- 'manual-hubspot_trigger_contact_created'
  config JSONB,
  status VARCHAR NOT NULL,           -- 'active' | 'error'
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Troubleshooting

### Workflow Activation Fails with 404

**Cause**: Code is trying to create webhook via API (not supported for Private Apps)

**Fix**: Use the updated `HubSpotTriggerLifecycle.ts` that only registers the workflow locally

### Webhook Not Receiving Events

**Checklist:**
1. ✅ Webhook URL configured in HubSpot Private App settings?
2. ✅ Event type subscribed in HubSpot?
3. ✅ `HUBSPOT_PRIVATE_APP_TOKEN` environment variable set?
4. ✅ Application redeployed after adding env var?
5. ✅ Workflow activated (entry in `trigger_resources`)?
6. ✅ User has HubSpot integration connected?

### Events Going to Wrong Workflows

**Cause**: Event type mapping mismatch

**Fix**: Check `TRIGGER_TYPE_MAPPING` in [HubSpotTriggerLifecycle.ts](lib/triggers/providers/HubSpotTriggerLifecycle.ts:40-50)

### Can't Subscribe to Specific Properties

**Limitation**: HubSpot UI may not allow property-level filtering for all event types

**Workaround**: Subscribe to `propertyChange` and filter in your workflow logic

## Migration Path to Public App

If you need per-workflow webhook management (not shared webhooks), you'll need to create a **HubSpot Public App**:

### Public App Benefits
- ✅ Programmatic webhook creation via API
- ✅ Per-workflow subscriptions
- ✅ Dynamic property filtering
- ✅ Better multi-tenant support

### Public App Requirements
- OAuth flow for user authorization
- App marketplace submission (for public use)
- Separate OAuth credentials management
- More complex architecture

### Migration Steps
1. Create Public App in HubSpot Developer Account
2. Implement OAuth flow (see `/lib/auth/hubspot-oauth.ts`)
3. Update `HubSpotTriggerLifecycle` to use OAuth tokens for webhook API
4. Use endpoint: `POST https://api.hubapi.com/webhooks/v3/{appId}/subscriptions`
5. Test with Developer API Key first, then migrate to OAuth

## References

- [HubSpot Webhooks API Documentation](https://developers.hubspot.com/docs/api/webhooks)
- [Private Apps Webhook Limitations](https://developers.hubspot.com/docs/guides/apps/private-apps/create-and-edit-webhook-subscriptions-in-private-apps)
- [Trigger Lifecycle Pattern](/learning/docs/action-trigger-implementation-guide.md#trigger-lifecycle-pattern)
- [HubSpot Trigger Lifecycle Implementation](/learning/walkthroughs/hubspot-trigger-lifecycle-implementation.md)
