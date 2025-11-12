# HubSpot Public App Setup Guide

## Why Public App Instead of Private App?

**Public Apps** support programmatic webhook management via API, allowing:
- ✅ Dynamic per-workflow webhook subscriptions
- ✅ Automatic webhook creation on workflow activation
- ✅ Automatic cleanup on workflow deactivation
- ✅ Better multi-user support
- ✅ Scalable architecture

**Private Apps** require manual webhook configuration in the UI (one webhook for all workflows).

---

## Step 1: Create HubSpot Developer Account

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)
2. Click **"Create App Developer Account"**
3. Complete the onboarding process
4. You'll get access to the Apps dashboard

---

## Step 2: Create a Public App

### Create the App

1. In HubSpot Developer Portal, go to **"Apps"** in the navigation
2. Click **"Create app"**
3. Fill in app details:
   - **App name:** ChainReact (or your preferred name)
   - **Description:** Workflow automation platform
   - **Logo:** Upload your logo (optional)

### Configure Auth (OAuth Settings)

1. Click the **"Auth"** tab
2. Add **Redirect URLs:**
   ```
   https://www.chainreact.app/api/integrations/hubspot/callback
   http://localhost:3000/api/integrations/hubspot/callback
   ```
   (localhost for development testing)

3. Add **Required Scopes** (click "Add new scope"):

   **✅ Essential Scopes:**
   - `oauth` - Required for OAuth (auto-added for apps created after April 2024)
   - `crm.objects.contacts.read` - Read contacts
   - `crm.objects.contacts.write` - Create/update contacts
   - `crm.objects.companies.read` - Read companies
   - `crm.objects.companies.write` - Create/update companies
   - `crm.objects.deals.read` - Read deals
   - `crm.objects.deals.write` - Create/update deals
   - `crm.lists.read` - Read lists
   - `crm.lists.write` - Create/update lists

   **⚠️ CRITICAL FOR WEBHOOKS:**
   - `webhooks` - Required to create/manage webhook subscriptions via API

4. Copy your credentials (you'll need these):
   - **Client ID**
   - **Client Secret**
   - **App ID** (in the app settings or URL)

---

## Step 3: Configure Environment Variables

Add these to your **Vercel** environment variables (or `.env.local` for local dev):

```bash
# HubSpot Public App OAuth Credentials
HUBSPOT_CLIENT_ID=your-client-id-here
HUBSPOT_CLIENT_SECRET=your-client-secret-here
HUBSPOT_APP_ID=your-app-id-here

# Optional: override requested OAuth scopes (space or comma separated)
# HUBSPOT_OAUTH_SCOPES="oauth crm.objects.contacts.read crm.objects.contacts.write"

# IMPORTANT: Remove or comment out the Private App token
# HUBSPOT_PRIVATE_APP_TOKEN=...
```

> ⚠️ **Scope mismatches**
>
> If you see `Authorization failed because there is a mismatch between the scopes in the install URL and the app's configured scopes`, set `HUBSPOT_OAUTH_SCOPES` (or `HUBSPOT_SCOPES`) to exactly match the scopes enabled in your HubSpot developer app. The OAuth flow and refresh token handler both read from this environment variable, so you only need to keep the list up to date in one place.

### Where to Find App ID

The **App ID** is a number that appears in:
- The URL when viewing your app: `https://app.hubspot.com/portal-dev/{portalId}/app/{appId}`
- The app details page in the Developer Portal

---

## Step 4: Update OAuth Scope in Code

The scope is already configured in your code, but needs the `webhooks` scope added:

**File:** `lib/integrations/oauthConfig.ts` (line 354-368)

Current scope:
```typescript
scope: "oauth crm.lists.read crm.lists.write crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write",
```

**Should include `webhooks`:**
```typescript
scope: "oauth webhooks crm.lists.read crm.lists.write crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write",
```

---

## Step 5: Update HubSpotTriggerLifecycle

**File:** `lib/triggers/providers/HubSpotTriggerLifecycle.ts`

The current implementation is set up for **Private Apps** (manual webhooks). We need to update it to use the **Webhooks API** with the Public App.

Key changes needed:
1. Use `HUBSPOT_APP_ID` instead of `HUBSPOT_PRIVATE_APP_TOKEN`
2. Get user's OAuth access token from `integrations` table
3. Use endpoint: `POST https://api.hubapi.com/webhooks/v3/{appId}/subscriptions`
4. Include `targetUrl` in the webhook subscription payload

---

## Step 6: Test the Integration

### Reconnect HubSpot

1. Go to ChainReact integrations page
2. **Disconnect** your existing HubSpot Private App connection (if any)
3. **Connect** again - this will use the new Public App OAuth flow
4. Verify you see the new scopes in the authorization screen (including `webhooks`)

### Test Workflow Activation

1. Create or open a workflow with a HubSpot trigger (e.g., "Contact Created")
2. **Activate** the workflow
3. Check logs - should see:
   ```
   ✅ HubSpot webhook subscription created: {subscription-id}
   ```
4. Verify in HubSpot Developer Portal:
   - Go to your app → "Webhooks" tab
   - Should see the subscription listed

### Test Trigger Execution

1. Create a new contact in HubSpot
2. Check ChainReact workflow executions
3. Should see the workflow executed automatically

---

## Architecture Comparison

### Private App (Old)
```
HubSpot → Manual Global Webhook → /api/webhooks/hubspot
                                      ↓
                        Query all workflows with trigger type
                                      ↓
                            Execute each workflow
```

### Public App (New)
```
User activates workflow
         ↓
   API creates webhook subscription
         ↓
HubSpot → Per-workflow webhook → /api/webhooks/hubspot?workflowId=xxx
                                           ↓
                                 Execute specific workflow
```

---

## Environment Variables Summary

```bash
# Required for Public App
HUBSPOT_CLIENT_ID=<from-app-auth-tab>
HUBSPOT_CLIENT_SECRET=<from-app-auth-tab>
HUBSPOT_APP_ID=<from-app-url-or-details>

# Optional - encryption (should already exist)
ENCRYPTION_KEY=<your-encryption-key>

# Not needed for Public App (remove/comment out)
# HUBSPOT_PRIVATE_APP_TOKEN=...
```

---

## Webhook API Endpoint Format

**Public App:**
```
POST https://api.hubapi.com/webhooks/v3/{appId}/subscriptions
Authorization: Bearer {user-oauth-token}

{
  "eventType": "contact.creation",
  "targetUrl": "https://www.chainreact.app/api/webhooks/hubspot?workflowId={workflowId}",
  "active": true
}
```

**vs. Private App (doesn't work):**
```
POST https://api.hubapi.com/webhooks/v3/subscriptions  ❌ 404 Error
Authorization: Bearer {private-app-token}
```

---

## Troubleshooting

### Missing `oauth` Scope
**Symptom:** Can't connect, authorization fails
**Fix:** Apps created before April 2024 may be missing the `oauth` scope. Add it manually in the Auth tab.

### 401 Unauthorized When Creating Webhook
**Cause:** Using wrong token type
**Fix:** Public Apps must use **user OAuth token** (from `integrations` table), NOT the App ID or Private App token

### 404 Not Found When Creating Webhook
**Cause:** Wrong endpoint URL or missing App ID
**Fix:** Ensure using `https://api.hubapi.com/webhooks/v3/{appId}/subscriptions` with correct App ID

### Webhook Not Receiving Events
**Checklist:**
1. ✅ Subscription created successfully (check HubSpot app dashboard)
2. ✅ `targetUrl` is correct and accessible
3. ✅ Event type matches (e.g., `contact.creation`)
4. ✅ Workflow is activated in ChainReact
5. ✅ Test event occurred in HubSpot

---

## Migration from Private App

If you previously set up the Private App:

1. ✅ **Leave existing workflows** - they'll still work temporarily with global webhook
2. ✅ **Create Public App** following steps above
3. ✅ **Update environment variables** (add App ID, update credentials)
4. ✅ **Deploy changes**
5. ✅ **Reconnect HubSpot** (disconnect old, connect new)
6. ✅ **Deactivate/Reactivate workflows** - this will create new per-workflow webhooks
7. ✅ **Remove Private App webhook** in HubSpot settings (optional cleanup)

---

## Next Steps

After completing this setup:
1. I'll update the code to use Public App API
2. You'll configure the environment variables
3. You'll create and configure the Public App in HubSpot
4. We'll test the dynamic webhook creation
5. Workflows will have individual webhook subscriptions!

---

## References

- [HubSpot Public Apps Documentation](https://developers.hubspot.com/docs/api/creating-an-app)
- [HubSpot Webhooks API](https://developers.hubspot.com/docs/api/webhooks)
- [OAuth 2.0 Setup](https://developers.hubspot.com/docs/api/working-with-oauth)
