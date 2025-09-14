# Slack Multi-Workspace Setup Guide

## Making Your Slack App Work for Any Workspace

The "invalid_team_for_non_distributed_app" error means your Slack app needs to be properly configured for distribution. Here's exactly what to check:

## Step 1: Verify App Configuration

Go to [api.slack.com/apps](https://api.slack.com/apps) and select your app.

### In "Basic Information":
1. Scroll to **Display Information**
2. Ensure you have:
   - ✅ App name
   - ✅ Short description (at least 10 characters)
   - ✅ Long description (optional but recommended)
   - ✅ App icon (512x512px PNG)
   - ✅ Background color

### In "OAuth & Permissions":
1. **Redirect URLs**:
   - Must have your callback URL: `https://your-domain.com/api/integrations/slack/callback`
   - For local dev: `http://localhost:3000/api/integrations/slack/callback`

2. **User Token Scopes** (not Bot Token Scopes):
   - channels:read
   - channels:write
   - chat:write
   - chat:write.public
   - groups:read
   - groups:write
   - im:read
   - im:write
   - users:read
   - team:read

## Step 2: Enable Workspace Installation

### Check App Manifest (Recommended Method):
1. In left sidebar, click **App Manifest**
2. Look for the `settings` section
3. Ensure it includes:
```yaml
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
  is_hosted: false
```

4. If you see `install_on_team: false`, change it to `true` or remove the line entirely

## Step 3: Alternative Configuration via UI

If App Manifest isn't available:

1. Go to **Manage Distribution** (may be under Settings)
2. If not visible, check **Collaborators** section
3. Ensure the app is not restricted to specific workspaces

## Step 4: OAuth Without Team Parameter

The key is that for a distributed app, you should NOT specify:
- `team` parameter in OAuth URL
- `multiple_workspaces` parameter (deprecated)

Your OAuth URL should look like:
```
https://slack.com/oauth/v2/authorize?
  client_id=YOUR_CLIENT_ID&
  user_scope=SCOPES&
  redirect_uri=CALLBACK&
  state=STATE
```

## Step 5: Test Installation Flow

1. Open an incognito/private browser window
2. Go to your OAuth URL
3. You should see a workspace selector dropdown
4. Select any workspace you're a member of
5. Authorize the app

## Common Issues and Solutions

### Still Getting "invalid_team_for_non_distributed_app"?

This means the app is still configured as single-workspace. Check:

1. **App Created in Enterprise Grid?**
   - Enterprise Grid apps have different distribution rules
   - May need to contact workspace admin

2. **App Type Mismatch?**
   - If app was created as "Internal Integration", it can't be distributed
   - You may need to create a new app as "Public Distribution"

3. **Legacy App?**
   - Older Slack apps may need migration
   - Check if there's an "Upgrade" banner in your app settings

## Creating a New Distributed App (If Needed)

If your current app can't be made distributable:

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App**
3. Choose **From scratch** (not from manifest)
4. Name your app and select a workspace
5. Immediately go to **OAuth & Permissions**
6. Add redirect URLs
7. Add user token scopes (listed above)
8. Save your Client ID and Client Secret
9. Update your `.env.local` with new credentials

## The User Token Approach

We're using user tokens (not bot tokens) which means:
- ✅ No workspace admin approval needed
- ✅ Works immediately after user authorizes
- ✅ Can perform actions as the installing user
- ✅ Perfect for user-initiated workflows

## Verification

After setup, your OAuth URL should:
1. NOT include `team` parameter
2. NOT include `scope` parameter (only `user_scope`)
3. Show workspace selector when opened
4. Work for any workspace the user is part of