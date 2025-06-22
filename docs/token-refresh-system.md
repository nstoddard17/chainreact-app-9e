# ChainReact OAuth Token Refresh System

This document provides an overview of the token refresh system implemented for ChainReact's OAuth integrations.

## Overview

The token refresh system is designed to automatically refresh OAuth access tokens before they expire, ensuring uninterrupted access to third-party APIs. The system is configuration-driven, making it easy to add new OAuth providers without code changes.

## Key Components

### 1. OAuth Provider Configuration

All OAuth provider configurations are centralized in `lib/integrations/oauthConfig.ts`. This file contains:
- Provider endpoints (authorization, token, revocation)
- Client authentication methods
- Token expiration parameters
- Refresh token requirements

To add a new OAuth provider, simply add its configuration to the `OAUTH_PROVIDERS` object.

### 2. Token Refresh Service

The main token refresh logic is implemented in `lib/integrations/tokenRefreshService.ts`. This service:
- Queries the database for active integrations with refresh tokens
- Prioritizes tokens based on expiration time
- Implements provider-specific refresh logic
- Updates the database with new tokens and expiration timestamps
- Handles errors and tracks failure metrics

### 3. Cron Job Endpoint

The system includes a serverless API route (`app/api/cron/refresh-tokens-simple/route.ts`) that can be triggered by an external scheduler (e.g., Vercel Cron) to perform token refresh operations.

### 4. Scheduled Task Script

For deployments that support it, the system includes a Node.js script (`scripts/scheduled-token-refresh.js`) that can be run as a scheduled task to refresh tokens.

## Database Schema

The system relies on the following fields in the `integrations` table:

- `id`: Unique identifier for the integration
- `user_id`: User who owns the integration
- `provider`: OAuth provider name (e.g., "google", "github")
- `access_token`: Current access token (required)
- `refresh_token`: Refresh token (if available)
- `expires_at`: ISO timestamp when the access token expires
- `refresh_token_expires_at`: ISO timestamp when the refresh token expires (if applicable)
- `status`: Current status of the integration ("active", "needs_reauthorization", etc.)
- `consecutive_failures`: Count of consecutive token refresh failures
- `last_failure_reason`: Error message from the last failed token refresh
- `last_token_refresh`: ISO timestamp of the last successful token refresh

## Usage

### Running the Token Refresh Process

#### Via API route (for serverless environments)

```bash
# Production
curl https://yourapp.com/api/cron/refresh-tokens-simple

# With parameters
curl https://yourapp.com/api/cron/refresh-tokens-simple?limit=100&provider=google&dry_run=true
```

#### Via Node.js script

```bash
# Run token refresh
npm run refresh-tokens

# Dry run (no database updates)
npm run refresh-tokens:dry-run

# With additional options
node scripts/scheduled-token-refresh.js --limit 100 --provider google
```

### Setting Up Scheduled Refresh

#### With Vercel Cron

Add the following to your `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-tokens-simple",
      "schedule": "0 */4 * * *"
    }
  ]
}
```

#### With traditional Cron

Add the following to your server's crontab:

```
# Run every 4 hours
0 */4 * * * cd /path/to/chainreact && npm run refresh-tokens
```

## Error Handling

The system implements several error handling mechanisms:

1. **Consecutive Failures Tracking**: Each failed refresh increments a counter
2. **Auto-Reauthorization**: After 3 consecutive failures, integrations are marked for reauthorization
3. **User Notifications**: When tokens expire or need reauthorization, users receive notifications
4. **Detailed Error Tracking**: Each refresh attempt logs the specific error for debugging

## Monitoring

The token refresh system provides detailed statistics that can be used for monitoring:

- Number of tokens processed, successful, failed, and skipped
- Success rate percentage
- Breakdown of errors by type
- Provider-specific statistics
- Duration of the refresh operation

## Adding a New OAuth Provider

To add a new OAuth provider:

1. Add the provider configuration to `lib/integrations/oauthConfig.ts`
2. Add environment variables for client credentials
3. No additional code changes are needed for the token refresh system 