# Slack OAuth Debugging Guide

## The "invalid_team_for_non_distributed_app" Error

This error ONLY occurs when:
1. The Slack app is NOT distributed (single workspace only)
2. You're trying to install it on a different workspace
3. The OAuth URL doesn't include the correct team parameter

## Critical Things to Check

### 1. Verify Your Client ID

**In your `.env.local`:**
```
SLACK_CLIENT_ID=your_client_id_here
```

**In Slack App Settings:**
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click on your app
3. Go to **Basic Information**
4. Find **App Credentials** → **Client ID**
5. **MAKE SURE THEY MATCH EXACTLY**

### 2. Check App Distribution Status

In your Slack app settings:

1. Look for **"Manage Distribution"** in the sidebar
2. If it says **"Activate Public Distribution"** - your app is NOT distributed
3. If it shows distribution settings - your app IS distributed

### 3. Common Misconfigurations

#### Issue: Multiple Slack Apps
You might have:
- An old single-workspace app
- A new distributed app
- Mixed up Client IDs between them

**Solution:** Verify you're using the Client ID from the DISTRIBUTED app

#### Issue: App Created Wrong
Some apps can't be made distributed if they were created as:
- Internal Integration
- Enterprise Grid App
- Legacy Classic App

**Solution:** Create a new app from scratch

### 4. Debug Steps

1. **Check the OAuth URL in Browser DevTools:**
   - Right-click the Connect button → Inspect
   - Go to Network tab
   - Click Connect
   - Look for the request to `slack.com/oauth/v2/authorize`
   - Check the `client_id` parameter

2. **Verify in Slack:**
   - When you see the error, check the URL
   - It will show which workspace it's trying to install to
   - Compare with where your app was created

### 5. The Nuclear Option - Create New App

If nothing else works:

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App**
3. Choose **From scratch**
4. Name it and select ANY workspace (doesn't matter which)
5. Immediately go to **OAuth & Permissions**
6. Add these **Bot Token Scopes**:
   - `chat:write`
   - `channels:read`
   - `groups:read`
   - `im:read`
   - `users:read`
   - `team:read`
7. Add your redirect URL
8. Go to **Manage Distribution**
9. Fill in required fields:
   - Add icon
   - Add description
   - Save
10. Get the new Client ID and Secret
11. Update your `.env.local`

## Current OAuth URL Configuration

We're now using:
```javascript
scope: "chat:write,channels:read,groups:read,im:read,users:read,team:read"
```

This is the standard bot scope configuration for distributed apps.

## Testing Checklist

- [ ] Client ID in .env matches distributed app
- [ ] Client Secret in .env matches distributed app  
- [ ] App shows as distributed in Slack settings
- [ ] Redirect URL is configured in app
- [ ] Bot Token Scopes are configured
- [ ] No team parameter in OAuth URL
- [ ] Using OAuth v2 endpoint

## If Still Failing

The error definitively means Slack thinks your app is NOT distributed. Either:
1. The Client ID is wrong
2. The app isn't actually distributed
3. There's a caching issue (try incognito mode)

There's no other cause for this specific error.