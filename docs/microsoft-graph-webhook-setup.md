# Microsoft Graph Webhook Setup Guide

This guide explains how to set up Microsoft Graph webhook subscriptions in your ChainReact application.

## Overview

The Microsoft Graph webhook system allows you to:
- Subscribe to changes in Microsoft 365 resources (emails, calendar events, files, etc.)
- Receive real-time notifications when changes occur
- Automatically trigger workflows based on Microsoft 365 events
- Handle subscription validation and renewal automatically

## Prerequisites

1. **Microsoft Azure App Registration**
   - Register an application in Azure Active Directory
   - Configure OAuth 2.0 redirect URIs
   - Note down Client ID and Client Secret

2. **Environment Variables**
   Add these to your `.env.local` file:
   ```env
   MICROSOFT_CLIENT_ID=your_client_id
   MICROSOFT_CLIENT_SECRET=your_client_secret
   MICROSOFT_REDIRECT_URI=https://your-domain.com/api/auth/microsoft/callback
   CRON_SECRET_TOKEN=your_secure_cron_token
   ```

3. **Database Setup**
   Run the database migrations:
   ```sql
   -- Run these SQL files in your Supabase database
   db/migrations/create_microsoft_tokens.sql
   db/migrations/create_microsoft_graph_subscriptions.sql
   ```

## Architecture

### Components

1. **Webhook Endpoint**: `/api/webhooks/microsoft`
   - Handles validation requests from Microsoft
   - Processes incoming webhook notifications
   - Triggers workflows based on events

2. **Subscription Manager**: `lib/microsoft-graph/subscriptionManager.ts`
   - Creates, renews, and deletes subscriptions
   - Manages subscription lifecycle
   - Handles token refresh

3. **Authentication**: `lib/microsoft-graph/auth.ts`
   - OAuth 2.0 flow for Microsoft Graph
   - Token management and refresh
   - Secure token storage

4. **API Routes**:
   - `/api/microsoft-graph/subscriptions` - Manage subscriptions
   - `/api/cron/renew-microsoft-subscriptions` - Automatic renewal

## Setup Steps

### 1. Microsoft Azure Configuration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Create a new registration or use existing one
4. Configure the following:

   **Authentication:**
   - Add redirect URI: `https://your-domain.com/api/auth/microsoft/callback`
   - Enable "Access tokens" and "ID tokens"

   **API Permissions:**
   - Microsoft Graph > Application permissions:
     - `Mail.Read`
     - `Mail.ReadWrite`
     - `Calendars.Read`
     - `Calendars.ReadWrite`
     - `Files.Read`
     - `Files.ReadWrite`
     - `User.Read`

   **Certificates & secrets:**
   - Create a new client secret
   - Note down the value (you'll need it for environment variables)

### 2. Database Setup

Run the provided SQL migrations in your Supabase database:

```bash
# Connect to your Supabase database and run:
\i db/migrations/create_microsoft_tokens.sql
\i db/migrations/create_microsoft_graph_subscriptions.sql
```

### 3. Environment Configuration

Update your environment variables:

```env
# Microsoft Graph Configuration
MICROSOFT_CLIENT_ID=your_azure_app_client_id
MICROSOFT_CLIENT_SECRET=your_azure_app_client_secret
MICROSOFT_REDIRECT_URI=https://your-domain.com/api/auth/microsoft/callback

# Cron Job Security
CRON_SECRET_TOKEN=your_secure_random_token

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### 4. Cron Job Setup

Set up automatic subscription renewal using a cron job service (e.g., Vercel Cron):

```json
{
  "crons": [
    {
      "path": "/api/cron/renew-microsoft-subscriptions",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

Or use external services like:
- **Vercel Cron**: Add to `vercel.json`
- **GitHub Actions**: Create workflow
- **AWS EventBridge**: Set up rule
- **Google Cloud Scheduler**: Create job

## Usage Examples

### 1. Create a Subscription

```typescript
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

// Subscribe to new emails in inbox
const subscription = await subscriptionManager.createSubscription({
  resource: "me/mailFolders('Inbox')/messages",
  changeType: "created",
  userId: "user-id",
  accessToken: "valid-access-token",
  expirationMinutes: 4320 // 3 days
})
```

### 2. Handle Webhook Notifications

The webhook endpoint automatically:
- Validates incoming requests
- Processes Microsoft Graph notifications
- Triggers relevant workflows
- Logs all activities

### 3. Manage Subscriptions

```typescript
// Get user's subscriptions
const subscriptions = await subscriptionManager.getUserSubscriptions(userId)

// Renew a subscription
await subscriptionManager.renewSubscription(subscriptionId, accessToken)

// Delete a subscription
await subscriptionManager.deleteSubscription(subscriptionId, accessToken)
```

## Available Resources

### Email Resources
- `me/mailFolders('Inbox')/messages` - Inbox messages
- `me/mailFolders('Sent')/messages` - Sent messages
- `me/messages` - All messages

### Calendar Resources
- `me/events` - Calendar events
- `me/calendars` - Calendars

### File Resources
- `me/drive/root/children` - OneDrive files
- `me/drive/items` - Drive items

### Change Types
- `created` - New items
- `updated` - Modified items
- `deleted` - Deleted items

## Security Features

### 1. Client State Verification
- Each subscription includes a secure `clientState` parameter
- Webhook endpoint verifies this state to prevent unauthorized requests

### 2. Row Level Security (RLS)
- Database tables use RLS policies
- Users can only access their own subscriptions and tokens

### 3. Token Management
- Access tokens are automatically refreshed
- Refresh tokens are securely stored
- Expired tokens are cleaned up

### 4. Cron Job Security
- Cron endpoint requires authentication token
- Prevents unauthorized subscription renewal

## Error Handling

### Common Errors

1. **401 Unauthorized**
   - Access token expired
   - Solution: Refresh token or re-authenticate

2. **403 Forbidden**
   - Insufficient permissions
   - Solution: Check Azure app permissions

3. **404 Not Found**
   - Subscription expired or deleted
   - Solution: Create new subscription

4. **429 Too Many Requests**
   - Rate limit exceeded
   - Solution: Implement exponential backoff

### Monitoring

Monitor webhook health:
- Check `/api/webhooks/microsoft` endpoint
- Review subscription status in database
- Monitor cron job execution logs

## Troubleshooting

### Webhook Not Receiving Notifications

1. Check subscription status in database
2. Verify webhook URL is accessible
3. Ensure Microsoft Graph permissions are correct
4. Check Azure app configuration

### Subscription Expiring Too Soon

1. Verify expiration time calculation
2. Check if renewal cron job is running
3. Ensure access tokens are valid
4. Review Microsoft Graph API limits

### Authentication Issues

1. Verify client ID and secret
2. Check redirect URI configuration
3. Ensure proper OAuth scopes
4. Validate token refresh logic

## Best Practices

1. **Monitor Subscription Health**
   - Regularly check subscription status
   - Set up alerts for failed renewals
   - Monitor webhook delivery rates

2. **Handle Token Expiration**
   - Implement automatic token refresh
   - Store refresh tokens securely
   - Handle refresh failures gracefully

3. **Rate Limiting**
   - Respect Microsoft Graph API limits
   - Implement exponential backoff
   - Queue requests when needed

4. **Security**
   - Use HTTPS for all webhook URLs
   - Validate client state parameters
   - Implement proper authentication
   - Log security events

## Support

For issues or questions:
1. Check Microsoft Graph documentation
2. Review Azure app configuration
3. Monitor application logs
4. Test with Microsoft Graph Explorer

## Resources

- [Microsoft Graph Webhooks Documentation](https://docs.microsoft.com/en-us/graph/webhooks)
- [Microsoft Graph API Reference](https://docs.microsoft.com/en-us/graph/api/overview)
- [Azure App Registration Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [OAuth 2.0 Flow](https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)
