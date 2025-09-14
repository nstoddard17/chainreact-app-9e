# Immediate Fix for Slack OAuth Error

## Quick Solution: Install to Your Specific Workspace

Since Slack's distribution settings have changed, here's the immediate fix:

### Step 1: Get Your Workspace ID

1. Open Slack in your browser
2. The URL will look like: `https://app.slack.com/client/T024BE7LD/C024BE91L`
3. The part after `/client/` starting with `T` is your workspace ID (e.g., `T024BE7LD`)

**Alternative method:**
1. In Slack desktop app, click workspace name (top-left)
2. Select **Settings & administration** → **Workspace settings**
3. In the browser that opens, the URL contains your workspace ID

### Step 2: Add to Environment Variables

Add this to your `.env.local` file:
```env
SLACK_TEAM_ID=T024BE7LD  # Replace with your workspace ID
```

### Step 3: Restart Your App

```bash
# Stop the current server (Ctrl+C)
# Start it again
npm run dev
```

### Step 4: Test Connection

1. Go to your integrations page
2. Click Connect for Slack
3. It should now work for your specific workspace

## Alternative: Create OAuth URL Manually

If the above doesn't work, you can create the OAuth URL manually:

1. Get your Slack Client ID from [api.slack.com/apps](https://api.slack.com/apps) → Your App → Basic Information
2. Use this URL format:
```
https://slack.com/oauth/v2/authorize?client_id=YOUR_CLIENT_ID&user_scope=channels:read,chat:write&redirect_uri=YOUR_CALLBACK_URL&team=YOUR_TEAM_ID
```

## Why This Works

- By specifying the `team` parameter, we tell Slack exactly which workspace to install to
- This bypasses the "distributed app" requirement
- The app will only work for your specific workspace, which is fine for development

## For Production

For a production app that multiple teams will use, you'll need to:

1. **Complete App Submission**:
   - Add app icon (512x512px)
   - Add description (10+ characters)
   - Add support email
   - Configure OAuth scopes properly

2. **Submit for Review** (if needed):
   - Some scopes require Slack review
   - This process can take a few days

3. **Or Use Slack App Directory**:
   - Submit your app to Slack's directory
   - This automatically makes it distributable

## Current Workaround Status

✅ Code has been updated to support team-specific installation
✅ Environment variable `SLACK_TEAM_ID` is now checked
✅ OAuth URL will include team parameter when set
⚠️ You need to add your workspace ID to `.env.local`