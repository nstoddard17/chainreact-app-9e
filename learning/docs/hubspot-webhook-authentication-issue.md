# HubSpot Webhook Authentication Issue & Solution

**Date:** October 17, 2025
**Issue:** 401 Authentication error when creating HubSpot webhook subscriptions
**Status:** ⚠️ Requires Configuration Change

## The Problem

When activating a workflow with a HubSpot trigger, we get this error:
```
Failed to create HubSpot webhook subscription: 401
"Authentication credentials not found. This API supports OAuth 2.0 authentication..."
```

## Root Cause

**HubSpot's Webhooks API works differently than expected:**

1. **User OAuth tokens CANNOT manage webhooks** - The webhook subscription API requires **app-level authentication**
2. **App-level auth required** - We need either:
   - A **Private App Access Token** (recommended)
   - Or a **Developer API Key** (legacy, deprecated)
3. **Per-app, not per-user** - Webhooks are managed at the app level, not user level

## Current Implementation (Incorrect)

```typescript
// ❌ WRONG: Using user OAuth token
const { data: integration } = await supabase
  .from('integrations')
  .select('access_token')  // This is the user's OAuth token
  .eq('user_id', userId)
  .eq('provider', 'hubspot')

const response = await fetch(`https://api.hubapi.com/webhooks/v3/${APP_ID}/subscriptions`, {
  headers: {
    'Authorization': `Bearer ${userOAuthToken}`  // ❌ This won't work for webhooks
  }
})
```

## Solution Options

### Option 1: Private App Access Token (Recommended)

**Pros:**
- Simpler to set up
- One token for the entire app
- No OAuth flow needed
- Full control over scopes

**Cons:**
- Single point of failure
- Need to manage token securely
- Need to create Private App in HubSpot

**Implementation:**
1. Create a Private App in HubSpot Developer Account
2. Give it webhook permissions + CRM read permissions
3. Get the Private App Access Token
4. Store it as environment variable: `HUBSPOT_PRIVATE_APP_TOKEN`
5. Use this token for ALL webhook management

```typescript
// ✅ CORRECT: Using Private App token
const response = await fetch(`https://api.hubapi.com/webhooks/v3/${APP_ID}/subscriptions`, {
  headers: {
    'Authorization': `Bearer ${process.env.HUBSPOT_PRIVATE_APP_TOKEN}`
  }
})
```

### Option 2: Use HubSpot's Workflow Webhooks (Alternative)

Instead of using the programmatic webhook API, leverage HubSpot's built-in workflow webhooks:

**How it works:**
1. Users manually create a workflow in HubSpot
2. Add a "Send webhook" action to their HubSpot workflow
3. Point it to our endpoint: `/api/webhooks/hubspot`
4. We receive the webhook and execute ChainReact workflows

**Pros:**
- No authentication issues
- Users can set up their own webhooks
- More flexible (they control the logic)

**Cons:**
- Requires manual setup by users
- Not as seamless
- Users need HubSpot Pro+ for workflows

### Option 3: Hybrid Approach (Best UX)

Combine both approaches:

**For automated triggers:**
- Use Private App Token for webhook subscriptions
- Handle all webhook management automatically
- Best user experience

**For advanced users:**
- Also support manual webhook setup
- Provide webhook URL in UI
- Let them configure custom HubSpot workflows

## Recommended Implementation

### Step 1: Set Up Private App

1. Go to HubSpot Developer Account
2. Create a new Private App or use existing
3. Required scopes:
   - `webhooks` - Manage webhook subscriptions
   - `crm.objects.contacts.read` - Read contacts
   - `crm.objects.companies.read` - Read companies
   - `crm.objects.deals.read` - Read deals
4. Copy the Access Token

### Step 2: Add Environment Variable

```bash
HUBSPOT_PRIVATE_APP_TOKEN=pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
HUBSPOT_APP_ID=your_app_id  # Already have this
```

### Step 3: Update HubSpotTriggerLifecycle

```typescript
// In /lib/triggers/providers/HubSpotTriggerLifecycle.ts

async onActivate(context: TriggerActivationContext): Promise<void> {
  // ... existing code ...

  // ✅ Use Private App token instead of user OAuth token
  const privateAppToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN
  if (!privateAppToken) {
    throw new Error('HUBSPOT_PRIVATE_APP_TOKEN not configured')
  }

  const response = await fetch(
    `https://api.hubapi.com/webhooks/v3/${process.env.HUBSPOT_APP_ID}/subscriptions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${privateAppToken}`,  // ✅ Private App token
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventType: mapping.subscriptionType,
        propertyName: config.propertyName || undefined,
        active: true
      })
    }
  )

  // ... rest of code ...
}
```

### Step 4: Update Webhook Receiver

The webhook receiver needs to:
1. Verify webhook came from HubSpot (signature validation)
2. Match event to workflows (already implemented)
3. Execute workflows with **user's OAuth token** for API calls

**Important:** User OAuth tokens ARE still used for:
- Creating contacts, deals, companies (actions)
- Reading data from HubSpot
- Any user-specific API calls

Only **webhook subscription management** needs the Private App token.

## Implementation Checklist

- [ ] Create HubSpot Private App
- [ ] Add required scopes to Private App
- [ ] Copy Private App Access Token
- [ ] Add `HUBSPOT_PRIVATE_APP_TOKEN` to `.env`
- [ ] Update `HubSpotTriggerLifecycle.ts` to use Private App token
- [ ] Add token validation/error handling
- [ ] Test webhook subscription creation
- [ ] Test webhook subscription deletion
- [ ] Document for users (how to set up)
- [ ] Add signature verification to webhook receiver (security)

## Security Considerations

1. **Store Private App Token Securely**
   - Use environment variables
   - Never commit to git
   - Rotate regularly

2. **Verify Webhook Signatures**
   - HubSpot sends `X-HubSpot-Signature` header
   - Validate HMAC-SHA256 signature
   - Prevents spoofed webhooks

3. **Scope Principle of Least Privilege**
   - Only grant necessary scopes to Private App
   - Don't grant write access if not needed

## Alternative: Manual Webhook Setup Documentation

If you don't want to use a Private App token, document this process for users:

### How to Set Up HubSpot Triggers (Manual)

1. In HubSpot, go to Automation → Workflows
2. Create a new workflow with your desired trigger (e.g., "Contact Created")
3. Add action: "Send webhook notification"
4. Set webhook URL to: `https://your-domain.com/api/webhooks/hubspot`
5. Add query parameter: `?workflowId=your-chainreact-workflow-id`
6. Save and activate

This approach:
- ✅ No Private App needed
- ✅ User has full control
- ❌ More complex setup
- ❌ Requires HubSpot Pro+

## Conclusion

The **correct solution is to use a Private App Access Token** for webhook subscription management, while continuing to use user OAuth tokens for actual CRM operations (creating contacts, reading deals, etc.).

This is a common pattern:
- **Stripe** - App webhooks with webhook secret
- **Shopify** - App webhooks managed by app
- **Slack** - App webhooks with bot token

HubSpot follows the same model - webhooks are app-level, not user-level.
