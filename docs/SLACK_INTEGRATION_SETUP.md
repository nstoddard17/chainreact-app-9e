# Slack Integration Setup Guide

## Fixing "invalid_team_for_non_distributed_app" Error

If you encounter the error `invalid_team_for_non_distributed_app` when trying to connect Slack, this means your Slack app is not configured for distribution to multiple workspaces.

## Solutions

### Option 1: Enable App Distribution (Recommended)

1. Go to your Slack app dashboard: https://api.slack.com/apps
2. Select your app (ID: 8980094760693.8980106283285)
3. Navigate to **"Manage Distribution"** in the sidebar
4. Click **"Activate Public Distribution"**
5. Fill in the required information:
   - App description
   - Support email
   - Privacy policy URL (can use your main app URL)
   - Terms of service URL (can use your main app URL)
6. Save changes

**Note:** This won't publish your app to the Slack App Directory - it just allows installation across different workspaces.

### Option 2: Restrict to Specific Workspace

If you only need the app to work in one specific Slack workspace:

1. Find your Slack Team ID:
   - Go to your Slack workspace
   - Open the workspace menu (top-left)
   - Select "Settings & administration" → "Workspace settings"
   - The Team ID is in the URL: `https://[TEAM_ID].slack.com/`

2. Add to your `.env.local` file:
   ```
   SLACK_TEAM_ID=YOUR_TEAM_ID_HERE
   ```

3. Restart your development server

### Option 3: Sign into Correct Workspace

Make sure you're signed into the Slack workspace where the app was created:

1. Go to https://slack.com/signout
2. Sign back in to the workspace where you created the Slack app
3. Try connecting again

## Current Configuration

- **Client ID:** 8980094760693.8980106283285
- **OAuth Version:** v2
- **Token Type:** User tokens (not bot tokens)
- **Scopes:** chat:write, channels:read, channels:write, groups:read, groups:write, im:read, im:write, users:read, team:read, files:read, files:write

## Testing

After making changes:
1. Clear your browser cache
2. Sign out of all Slack workspaces
3. Try connecting Slack again through the ChainReact app

## Additional Resources

- [Slack OAuth Documentation](https://api.slack.com/authentication/oauth-v2)
- [Distributing Slack Apps](https://api.slack.com/distribution)
- [Slack App Management](https://api.slack.com/apps)