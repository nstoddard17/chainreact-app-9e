# Slack OAuth Local Development Setup

## Setup for Dynamic Host URL

The application now uses the dynamic host URL from `getBaseUrl()` for all OAuth redirect URIs. This allows the same code to work in both local development and production.

## Required Slack App Configuration

Add ALL of these redirect URIs to your Slack app's OAuth settings:
1. `http://localhost:3000/api/integrations/slack/callback` (local development)
2. `https://chainreact.app/api/integrations/slack/callback` (production)
3. Any ngrok URLs if using ngrok for testing

## How It Works

The application uses `getBaseUrl()` which automatically detects:
- `http://localhost:3000` when running locally
- `https://chainreact.app` in production (from NEXT_PUBLIC_BASE_URL)
- The actual host URL when accessed from different environments

This URL is used consistently for:
1. Generating the OAuth authorization URL
2. The redirect URI parameter in the authorization URL
3. The redirect URI in the token exchange

## Setting Up Your Slack App

1. **Go to Slack App Settings**:
   - Navigate to https://api.slack.com/apps
   - Select your app
   - Go to **OAuth & Permissions**

2. **Add Redirect URLs**:
   Add these redirect URLs:
   ```
   http://localhost:3000/api/integrations/slack/callback
   https://chainreact.app/api/integrations/slack/callback
   ```

3. **Configure Scopes**:
   Ensure these Bot Token Scopes are added:
   - `chat:write`
   - `channels:read`
   - `groups:read`
   - `im:read`
   - `users:read`
   - `team:read`

4. **Ensure App is Distributed**:
   - Go to **Manage Distribution**
   - Make sure the app is publicly distributed
   - This allows any workspace to install the app

## Environment Variables

Only these are required in `.env.local`:
```bash
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
```

No need for a specific `SLACK_REDIRECT_URI` as the app now uses the dynamic host URL.

## Debugging OAuth Issues

If you encounter issues:

1. **Check the server logs** to see what URLs are being used:
   ```
   🔗 Generated Slack auth URL: ...
   📍 Using base URL: ...
   ```

2. **Verify redirect URI matches**:
   - The redirect URI in the auth URL must exactly match one in your Slack app settings
   - Check for trailing slashes, HTTP vs HTTPS, port numbers

3. **Common "invalid_code" causes**:
   - Redirect URI mismatch (most common)
   - Code expired (10 minute timeout)
   - Code already used (can only be used once)

4. **Test the flow**:
   - Clear browser cookies/cache
   - Try in incognito mode
   - Check browser network tab for the exact redirect URI being used

## Using ngrok (Optional)

If you need to test with a public URL:

1. **Install ngrok**:
   ```bash
   brew install ngrok
   ```

2. **Start ngrok tunnel**:
   ```bash
   ngrok http 3000
   ```

3. **Add ngrok URL to Slack app**:
   Add the ngrok URL to your redirect URLs in Slack:
   ```
   https://your-ngrok-url.ngrok.io/api/integrations/slack/callback
   ```

4. **Access your app through ngrok**:
   Use the ngrok URL to access your app, and the OAuth flow will use that URL automatically.

## Quick Checklist

- [ ] Slack app is publicly distributed
- [ ] Added `http://localhost:3000/api/integrations/slack/callback` to Slack redirect URLs
- [ ] Added `https://chainreact.app/api/integrations/slack/callback` to Slack redirect URLs
- [ ] SLACK_CLIENT_ID and SLACK_CLIENT_SECRET are set in .env.local
- [ ] Bot token scopes are configured in Slack app