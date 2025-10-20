# HubSpot Webhook Authentication Issue & Solution

**Date:** October 17, 2025 (Updated: October 18, 2025)
**Issue:** 401 Authentication error when creating HubSpot webhook subscriptions
**Status:** ✅ FIXED - Expired Token Issue Resolved

## The Problem

When activating a workflow with a HubSpot trigger, we got this error:
```
Failed to create HubSpot webhook subscription: 401
"Authentication credentials not found. This API supports OAuth 2.0 authentication..."
```

## Root Cause Analysis (Following CLAUDE.md Protocol)

### Initial Hypothesis (WRONG)
Initially thought HubSpot's Webhooks API required app-level authentication (Private App token) instead of user OAuth tokens.

### Actual Root Cause (CORRECT)
After comparing with working implementation (Microsoft Graph) and reading HubSpot's official documentation:

**The HubSpot trigger was using an EXPIRED OAuth token without refreshing it.**

#### Evidence:
1. **Microsoft Graph (working)**: Uses `MicrosoftGraphAuth.getValidAccessToken()` which automatically checks token expiration and refreshes if needed
2. **HubSpot (broken)**: Directly decrypts token from database without any expiration check or refresh logic
3. **HubSpot Documentation**: Confirms Public Apps use **user OAuth tokens** for webhook API (NOT Private App tokens)

### The Fix
Use the existing `getDecryptedAccessToken()` utility which:
1. Checks if the access token is expired (within 5 minutes)
2. Automatically refreshes it using the refresh token
3. Returns a valid, non-expired token

## HubSpot Webhook API Authentication (CLARIFIED)

**Correct approach for Public Apps:**
- ✅ Use **user OAuth tokens** from integrations table
- ✅ Tokens must have `webhooks` scope
- ✅ Tokens are automatically refreshed when expired
- ❌ Do NOT use Private App tokens (different use case)

## Implementation Change

### Before (Broken)
```typescript
// ❌ WRONG: Token expired, not refreshed
const { data: integration } = await supabase
  .from('integrations')
  .select('access_token')
  .eq('user_id', userId)
  .eq('provider', 'hubspot')
  .single()

const accessToken = await safeDecrypt(integration.access_token)
// Token could be expired - no check, no refresh
```

### After (Fixed)
```typescript
// ✅ CORRECT: Automatically refreshes if expired
const accessToken = await getDecryptedAccessToken(userId, 'hubspot')
// Token is guaranteed to be valid and not expired
```

## Files Changed
- **[lib/triggers/providers/HubSpotTriggerLifecycle.ts](../../lib/triggers/providers/HubSpotTriggerLifecycle.ts)**
  - Added import: `getDecryptedAccessToken`
  - Removed import: `safeDecrypt` (no longer needed)
  - Updated `onActivate()`: Now uses automatic token refresh
  - Updated `onDeactivate()`: Now uses automatic token refresh
  - Updated `checkHealth()`: Now uses automatic token refresh

## Previous Documentation (Now Outdated)

The sections below were written before discovering the real issue (expired tokens). They're kept for historical reference.

### Original Theory: App-Level vs User-Level Auth

## ~~Solution Options~~ (NOT THE ISSUE)

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

## ~~Conclusion~~ (OUTDATED)

~~The **correct solution is to use a Private App Access Token** for webhook subscription management~~

**UPDATE:** This conclusion was incorrect. The real issue was expired tokens not being refreshed.

---

## Final Summary

### What We Learned

1. **Always follow Root Cause Analysis Protocol** (from CLAUDE.md)
   - Compare working vs broken implementations
   - Don't assume - verify with code and documentation
   - The issue was NOT about Private App vs Public App
   - The issue WAS about expired tokens

2. **Token Refresh is Critical**
   - OAuth access tokens expire (HubSpot: 6 hours)
   - Triggers can be activated days/weeks after initial connection
   - ALWAYS use `getDecryptedAccessToken()` which handles refresh automatically
   - Never decrypt tokens directly unless you have a good reason

3. **Pattern to Follow**
   - ✅ DO: Use `getDecryptedAccessToken(userId, provider)` for all integrations
   - ❌ DON'T: Manually decrypt tokens with `safeDecrypt()` in trigger/action code
   - 💡 WHY: Automatic refresh prevents 401 errors from expired tokens

### Testing Recommendation

After this fix, test by:
1. Connect HubSpot integration
2. Wait for token to expire (6+ hours) OR manually set `expires_at` to past date in database
3. Activate a workflow with HubSpot trigger
4. Should succeed (token auto-refreshes) instead of 401 error

### Related Files
- Token refresh utility: [lib/integrations/getDecryptedAccessToken.ts](../../lib/integrations/getDecryptedAccessToken.ts)
- Token refresh service: [lib/integrations/tokenRefreshService.ts](../../lib/integrations/tokenRefreshService.ts)
- OAuth config: [lib/integrations/oauthConfig.ts](../../lib/integrations/oauthConfig.ts)
