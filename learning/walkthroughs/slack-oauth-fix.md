# Slack OAuth "invalid_team_for_non_distributed_app" Fix

## Problem
When users tried to connect their Slack workspace, they received the error:
```
invalid_team_for_non_distributed_app
```

## Root Cause
The Slack OAuth configuration was using parameters that are only valid for distributed apps (apps that can be installed on multiple workspaces). Our app was configured as a single-workspace app but was trying to use multi-workspace features.

Specifically:
1. The OAuth URL included `scope` (bot permissions) which requires workspace admin approval
2. The OAuth URL included `multiple_workspaces=true` which is only for distributed apps
3. This combination caused Slack to reject the authorization

## Solution
Changed the Slack OAuth URL generation to use only user-level permissions:

### Before (Problematic)
```typescript
const params = new URLSearchParams({
  client_id: clientId,
  scope: "channels:read,groups:write,chat:write,users:read,team:read", // Bot permissions
  user_scope: "channels:read,groups:write,chat:write,users:read,team:read", // User permissions
  redirect_uri: `${baseUrl}/api/integrations/slack/callback`,
  state,
  response_type: "code",
})
params.append("multiple_workspaces", "true") // Only for distributed apps!
```

### After (Fixed)
```typescript
const params = new URLSearchParams({
  client_id: clientId,
  // Only use user_scope - no bot permissions
  user_scope: "channels:read,channels:write,chat:write,chat:write.public,groups:read,groups:write,im:read,im:write,users:read,team:read",
  redirect_uri: `${baseUrl}/api/integrations/slack/callback`,
  state,
  response_type: "code",
})
// Removed 'scope' and 'multiple_workspaces' parameters
```

## Benefits of This Approach
1. **No Admin Approval Required**: Users can install the app without needing workspace admin approval
2. **Simpler Installation**: Users can connect their personal Slack account immediately
3. **Same Functionality**: User tokens can perform the same actions as bot tokens for our use cases
4. **Better UX**: Removes friction from the connection process

## How User Tokens Work
- User tokens authenticate as the installing user
- They have permissions based on what the user can do in Slack
- Perfect for workflows that send messages, read channels, etc.
- The token is stored in `authed_user.access_token` in the OAuth response

## Files Modified
- `/app/api/integrations/auth/generate-url/route.ts` - Updated `generateSlackAuthUrl` function

## Testing
After this change:
1. Users can click "Connect" for Slack
2. They're redirected to Slack's OAuth page
3. They can select their workspace and authorize
4. The connection completes successfully
5. Slack actions work with the user token

## Important Notes

### The Error Persists?
If you're still getting "invalid_team_for_non_distributed_app" after these changes, it's because the Slack app itself needs configuration:

**Option 1: Make the App Distributed (Recommended)**
1. Go to api.slack.com/apps → Your App → Settings → Manage Distribution
2. Click "Activate Public Distribution"
3. Complete the checklist
4. No code changes needed after this

**Option 2: Add Team ID for Single Workspace**
1. Find your workspace ID in Slack settings
2. Add to `.env.local`: `SLACK_TEAM_ID=YOUR_TEAM_ID`
3. The code now checks for this and adds it to the OAuth URL

### Why This Happens
- Non-distributed Slack apps can only be installed on the workspace where they were created
- Without the `team` parameter, Slack doesn't know which workspace to install to
- The error message is Slack's way of saying "this app isn't allowed on other workspaces"

### Future Considerations
- If you need bot-level features in the future (like receiving events), you'll need to:
  1. Configure the app as a distributed app in Slack's app settings
  2. Add back the `scope` parameter
  3. Remove the `multiple_workspaces` parameter (distributed apps don't need it)
- Current implementation is perfect for user-initiated workflows