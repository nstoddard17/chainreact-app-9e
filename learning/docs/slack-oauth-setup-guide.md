# Slack OAuth Setup Guide

## The "invalid_team_for_non_distributed_app" Error

This error occurs when a Slack app that is configured for a single workspace tries to be installed on a different workspace. There are two solutions:

## Solution 1: Configure App as Distributed (Recommended)

This allows your app to be installed on any Slack workspace.

### Steps:
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Select your app
3. Go to **Settings** → **Manage Distribution**
4. Click **Activate Public Distribution**
5. Complete the app submission checklist:
   - Add app description
   - Add app icon
   - Configure OAuth scopes
   - Add redirect URLs
6. Once activated, your app can be installed on any workspace

### Update Code:
No code changes needed - the current implementation will work once the app is distributed.

## Solution 2: Single Workspace App (Quick Fix)

If you only need the app to work on one specific workspace:

### Steps:
1. Find your Slack workspace ID (team ID):
   - In Slack, go to **Workspace Settings** → **About This Workspace**
   - Look for "Workspace ID" (starts with T, like `T024BE7LD`)
   
2. Add to your `.env.local`:
```env
SLACK_TEAM_ID=T024BE7LD  # Replace with your actual team ID
```

3. Restart your development server

The app will now only work for that specific workspace.

## Current OAuth Configuration

Our implementation uses **user token authentication** which:
- Doesn't require workspace admin approval
- Works immediately after user authorization
- Can perform all necessary actions (send messages, read channels, etc.)

### Scopes We Request:
- `channels:read` - View basic channel info
- `channels:write` - Create channels
- `chat:write` - Send messages
- `chat:write.public` - Send to channels without joining
- `groups:read` - Read private channel info
- `groups:write` - Manage private channels
- `im:read` - Read direct messages
- `im:write` - Send direct messages
- `users:read` - View user info
- `team:read` - View workspace info

## Testing Your Configuration

1. After making changes, restart your dev server
2. Try connecting Slack again
3. Check the console logs for the generated URL
4. The URL should either:
   - Include `team=YOUR_TEAM_ID` (for single workspace)
   - Work without team parameter (for distributed app)

## Common Issues

### "invalid_team_for_non_distributed_app"
- **Cause**: Non-distributed app without team parameter
- **Fix**: Either distribute the app OR add SLACK_TEAM_ID

### "invalid_auth"
- **Cause**: Invalid client ID or secret
- **Fix**: Check SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in .env

### "redirect_uri_mismatch"
- **Cause**: Callback URL not configured in Slack app
- **Fix**: Add your callback URL to Slack app OAuth settings

## Recommended Approach

For production apps, **always use Solution 1 (Distributed App)**. This provides the best user experience and allows any workspace to use your integration.

For development/testing, Solution 2 (Single Workspace) is fine as a quick workaround.