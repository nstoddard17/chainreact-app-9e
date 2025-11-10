# Integration Email Storage - Implementation Guide

## Overview
This document tracks which OAuth integrations properly fetch and store user email addresses for account identification in the ServiceConnectionSelector UI component.

## Database Schema

### New Columns Added (Migration: 20251110000000)
```sql
ALTER TABLE integrations
ADD COLUMN email TEXT,
ADD COLUMN username TEXT,
ADD COLUMN account_name TEXT;
```

**Before:** Email/username stored in `metadata` JSONB column
**After:** Dedicated columns + metadata backup for flexibility

## Storage Location

### Where Email is Stored:
1. **Primary:** Top-level `email` column (indexed, easily queryable)
2. **Backup:** `metadata.email` (JSONB, flexible but slower to query)

### OAuth Callback Handler Logic:
The `oauth-callback-handler.ts` utility automatically extracts:
- `email` from `additionalData.email` or `additionalData.userEmail`
- `username` from `additionalData.username` or `additionalData.name`
- `account_name` from `additionalData.account_name` or `additionalData.name`

## Integration Status

### ✅ Providers That Fetch Email

| Provider | Fetches Email | API Endpoint | Notes |
|----------|--------------|--------------|-------|
| Gmail | ✅ Yes | `https://www.googleapis.com/oauth2/v2/userinfo` | Lines 30-49 in callback |
| Google Drive | ✅ Yes | Same as Gmail | Shares Google OAuth flow |
| Google Sheets | ✅ Yes | Same as Gmail | Shares Google OAuth flow |
| Google Calendar | ✅ Yes | Same as Gmail | Shares Google OAuth flow |
| Google Docs | ✅ Yes | Same as Gmail | Shares Google OAuth flow |
| Google Analytics | ✅ Yes | Same as Gmail | Shares Google OAuth flow |
| Gumroad | ✅ Yes | `https://api.gumroad.com/v2/user` | Lines 119-141 in callback |
| YouTube | ✅ Yes | Same as Gmail | Uses Google OAuth |
| YouTube Studio | ✅ Yes | Same as Gmail | Uses Google OAuth |

### ❌ Providers That DON'T Fetch Email (Need Update)

| Provider | Current Status | User Info API | Action Required |
|----------|---------------|---------------|-----------------|
| Slack | ❌ No email | `https://slack.com/api/users.identity` | Add user fetch |
| Discord | ❌ No email | `https://discord.com/api/users/@me` | Add user fetch |
| Microsoft Outlook | ❌ No email | `https://graph.microsoft.com/v1.0/me` | Add user fetch |
| OneDrive | ❌ No email | Same as Outlook | Add user fetch |
| Microsoft OneNote | ❌ No email | Same as Outlook | Add user fetch |
| Notion | ❌ No email | `https://api.notion.com/v1/users/me` | Add user fetch |
| Airtable | ❌ No email | `https://api.airtable.com/v0/meta/whoami` | Add user fetch |
| HubSpot | ❌ No email | `https://api.hubapi.com/oauth/v1/access-tokens/{token}` | Add user fetch |
| Stripe | ❌ No email | `https://api.stripe.com/v1/account` | Add user fetch |
| Trello | ❌ No email | `https://api.trello.com/1/members/me` | Add user fetch |
| Shopify | ❌ No email | `https://shop.myshopify.com/admin/api/2023-10/shop.json` | Add user fetch |
| GitHub | ❌ No email | `https://api.github.com/user` | Add user fetch |
| LinkedIn | ❌ No email | `https://api.linkedin.com/v2/me` | Add user fetch |
| Facebook | ❌ No email | `https://graph.facebook.com/me?fields=email,name` | Add user fetch |
| Instagram | ❌ No email | `https://graph.instagram.com/me?fields=username` | Add user fetch |
| Twitter | ❌ No email | `https://api.twitter.com/2/users/me` | Add user fetch |
| Dropbox | ❌ No email | `https://api.dropboxapi.com/2/users/get_current_account` | Add user fetch |
| Box | ❌ No email | `https://api.box.com/2.0/users/me` | Add user fetch |
| Monday | ❌ No email | `https://api.monday.com/v2` (GraphQL) | Add user fetch |
| Mailchimp | ❌ No email | `https://login.mailchimp.com/oauth2/metadata` | Add user fetch |
| Blackbaud | ❌ No email | Provider-specific | Add user fetch |
| Kit | ❌ No email | `https://api.convertkit.com/v3/account` | Add user fetch |
| PayPal | ❌ No email | `https://api.paypal.com/v1/identity/oauth2/userinfo` | Add user fetch |
| Microsoft Teams | ❌ No email | Same as Outlook | Add user fetch |

## How to Add Email Fetching

### Template for Adding Email Fetch:

```typescript
additionalIntegrationData: async (tokenData) => {
  try {
    // Fetch user profile from provider's API
    const userResponse = await fetch('PROVIDER_USER_INFO_ENDPOINT', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        // Some APIs need additional headers:
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
    })

    if (userResponse.ok) {
      const userInfo = await userResponse.json()

      return {
        email: userInfo.email, // Adjust field name based on API response
        username: userInfo.username || userInfo.login || userInfo.name,
        account_name: userInfo.name || userInfo.display_name || userInfo.email,
        // Keep any provider-specific fields
        provider_user_id: userInfo.id,
      }
    } else {
      logger.warn('Failed to fetch user info:', userResponse.status)
      return {}
    }
  } catch (error) {
    logger.error('Error fetching user info:', error)
    return {}
  }
}
```

### Example: Adding Email to Slack

**Before:**
```typescript
additionalIntegrationData: (tokenData, state) => {
  return {
    team_id: tokenData.team?.id,
    team_name: tokenData.team?.name,
    // ... no email
  }
}
```

**After:**
```typescript
additionalIntegrationData: async (tokenData, state) => {
  let userEmail = null
  let userName = null

  // Fetch user identity from Slack
  try {
    const identityResponse = await fetch('https://slack.com/api/users.identity', {
      headers: {
        Authorization: `Bearer ${tokenData.authed_user?.access_token || tokenData.access_token}`,
      },
    })

    if (identityResponse.ok) {
      const identity = await identityResponse.json()
      if (identity.ok) {
        userEmail = identity.user?.email
        userName = identity.user?.name
      }
    }
  } catch (error) {
    logger.error('Failed to fetch Slack user identity:', error)
  }

  return {
    email: userEmail,
    username: userName,
    account_name: userName || userEmail,
    team_id: tokenData.team?.id,
    team_name: tokenData.team?.name,
    // ... rest of the fields
  }
}
```

## Migration Instructions

### 1. Apply Database Migration
```bash
supabase db push
```

This will:
- Add `email`, `username`, `account_name` columns
- Backfill from existing `metadata` JSON
- Create indexes for fast lookups

### 2. Verify Migration
```sql
-- Check if columns were added
\d integrations

-- Check backfilled data
SELECT id, provider, email, username, account_name
FROM integrations
WHERE email IS NOT NULL
LIMIT 10;
```

### 3. Test OAuth Flow
1. Connect a new integration (e.g., Gmail)
2. Check that email is stored in top-level column:
   ```sql
   SELECT email, username, account_name, metadata
   FROM integrations
   WHERE provider = 'gmail'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

## UI Display

The `ServiceConnectionSelector` component now shows:
- Email address (if available)
- Workspace type badge (Personal/Team/Organization)
- Status badge (Active/Error/Pending)

**Fallback behavior:**
- If no email: Shows username
- If no username: Shows account_name
- If none: Shows "Connected Account"

## Next Steps

1. **Priority**: Update providers with high user count first (Slack, Discord, Outlook)
2. **Testing**: Test each provider's OAuth flow after adding email fetch
3. **Documentation**: Update provider-specific docs with email capture confirmation
4. **Monitoring**: Log when email fetch fails to identify API changes

## Related Files

- Migration: `/supabase/migrations/20251110000000_add_account_identity_fields.sql`
- OAuth Handler: `/lib/integrations/oauth-callback-handler.ts`
- API Endpoint: `/app/api/integrations/route.ts`
- UI Component: `/components/workflows/configuration/ServiceConnectionSelector.tsx`
- Integration Store: `/stores/integrationStore.ts`
