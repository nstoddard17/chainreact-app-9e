# HubSpot Triggers Setup Guide

**Quick Start:** Follow these steps to enable HubSpot webhook triggers in your workflow automation platform.

## Why This Is Needed

HubSpot's webhook API requires **app-level authentication** (not user OAuth tokens). This means you need to create a Private App in HubSpot and use its access token to manage webhook subscriptions.

**Important:** User OAuth tokens are still used for all CRM operations (creating contacts, reading deals, etc.). The Private App token is ONLY for webhook subscription management.

## Setup Steps

### 1. Create a Private App in HubSpot

1. Log in to your **HubSpot account**
2. Click the **settings icon** (gear) in the top right
3. Navigate to **Integrations** → **Private Apps**
4. Click **"Create a private app"**
5. Give it a name: `ChainReact Webhook Manager`
6. Add a description: `Manages webhook subscriptions for ChainReact workflow automation`

### 2. Configure Scopes

Give the Private App these **minimum required scopes**:

#### Webhooks (Required)
- ✅ `webhooks` - Manage webhook subscriptions

#### CRM Objects (Required - for reading trigger data)
- ✅ `crm.objects.contacts.read` - Read contacts
- ✅ `crm.objects.companies.read` - Read companies
- ✅ `crm.objects.deals.read` - Read deals

**Note:** Do NOT grant write access unless absolutely necessary. Private App tokens are powerful.

### 3. Create the App & Get Token

1. Click **"Create app"**
2. Copy the **Access Token** (starts with `pat-na1-...`)
3. **Store it securely** - you won't be able to see it again!

### 4. Add Environment Variables

Add these to your `.env` file:

```bash
# HubSpot Private App Token (for webhook subscription management)
HUBSPOT_PRIVATE_APP_TOKEN=pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# HubSpot App ID (you should already have this)
HUBSPOT_APP_ID=your_app_id_here
```

**Security Note:** Never commit these to git!

### 5. Restart Your Application

```bash
npm run dev
```

Or if running in production:
```bash
pm2 restart your-app
# or
npm run build && npm start
```

### 6. Test It!

1. Create a workflow with a HubSpot trigger (e.g., "Contact Created")
2. Click **"Activate"** workflow
3. Check logs - you should see:
   ```
   🔔 Activating HubSpot trigger for workflow...
   📤 Creating HubSpot webhook subscription...
   ✅ HubSpot webhook subscription created: 12345
   ```
4. Create a test contact in HubSpot
5. Your workflow should execute automatically!

## Troubleshooting

### Error: "HUBSPOT_PRIVATE_APP_TOKEN not configured"

**Solution:** Add the `HUBSPOT_PRIVATE_APP_TOKEN` environment variable and restart your app.

### Error: "401 Authentication credentials not found"

**Possible causes:**
1. Private App token is incorrect
2. Token wasn't added to environment variables
3. App wasn't restarted after adding token

**Solution:** Double-check the token, verify it's in `.env`, and restart.

### Error: "403 Forbidden" or "Insufficient permissions"

**Solution:** Go back to your Private App settings and ensure it has the `webhooks` scope enabled.

### Webhooks Not Firing

**Check:**
1. Workflow is activated (status: "active")
2. HubSpot trigger is properly configured
3. Check `trigger_resources` table for subscription record
4. Verify webhook subscription exists in HubSpot Developer Dashboard
5. Check application logs for webhook POST requests

## How It Works

### Webhook Creation Flow:
```
User activates workflow
  → System uses Private App token to create webhook subscription in HubSpot
  → Subscription stored in trigger_resources table
  → Workflow ready to receive events
```

### Webhook Event Flow:
```
Event occurs in HubSpot (contact created, deal updated, etc.)
  → HubSpot sends POST to /api/webhooks/hubspot
  → System finds matching workflows in trigger_resources
  → Executes workflows using USER's OAuth token for CRM operations
  → Workflow processes the event
```

### Key Point:
- **Private App Token** = Webhook subscription management only
- **User OAuth Token** = All CRM operations (read/write contacts, deals, etc.)

## Security Best Practices

1. **Rotate tokens regularly** - Create new Private App token every 90 days
2. **Principle of least privilege** - Only grant necessary scopes
3. **Monitor usage** - Check HubSpot's API logs for suspicious activity
4. **Implement signature verification** - Validate webhook authenticity (TODO)

## Alternative: Manual Webhook Setup

If you don't want to use a Private App token, users can manually set up webhooks:

1. In HubSpot: Automation → Workflows
2. Create workflow with desired trigger
3. Add action: "Send webhook notification"
4. URL: `https://your-domain.com/api/webhooks/hubspot?workflowId=<id>`
5. Activate workflow

**Pros:** No Private App needed
**Cons:** Manual setup, requires HubSpot Pro+

## Documentation References

- [HubSpot Webhooks API](https://developers.hubspot.com/docs/api/webhooks)
- [Private Apps Guide](https://developers.hubspot.com/docs/api/private-apps)
- [Authentication Issue Details](/learning/docs/hubspot-webhook-authentication-issue.md)
- [Implementation Walkthrough](/learning/walkthroughs/hubspot-trigger-lifecycle-implementation.md)

## Need Help?

Check the full documentation:
- `/learning/docs/hubspot-webhook-authentication-issue.md` - Detailed authentication explanation
- `/learning/walkthroughs/hubspot-trigger-lifecycle-implementation.md` - Complete implementation guide

---

**Status:** ✅ Implementation complete, just needs Private App token configuration
