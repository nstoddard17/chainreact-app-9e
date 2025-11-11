# Account Deletion Testing Script

## Quick Testing Steps

### 1. Start Dev Server

```bash
npm run dev
```

### 2. Test Delete Flow

1. **Navigate to Workflow Builder**
   - Go to any workflow with an integration (e.g., Gmail, Slack)
   - Open the action configuration modal

2. **Find Account Dropdown**
   - Look for the account selector with connected accounts
   - You should see:
     - Account email/name
     - Avatar or initials
     - Workspace type (Personal/Team/Org)
     - Red X button on the right

3. **Click X Button**
   - Click the red X button
   - Confirmation dialog should appear with:
     - "Remove Account?" title
     - Account name in bold
     - List of 3 actions:
       - "Disconnect this account from all workflows"
       - "Revoke all permissions granted to ChainReact"
       - "Require you to re-authorize from scratch if reconnecting"
     - Cancel and "Remove Account" buttons

4. **Confirm Deletion**
   - Click "Remove Account"
   - Account should disappear from dropdown **immediately**
   - Check browser console - should see no errors
   - Check Network tab - should see DELETE request to `/api/integrations/{id}`

5. **Verify Server Logs**
   ```
   🔐 [DELETE /api/integrations/{id}] Revoking OAuth token for {provider}
   ✅ Successfully revoked {provider} OAuth token
   ✅ [DELETE /api/integrations/{id}] Integration {provider} disconnected by user {userId}
   ```

6. **Test Reconnection**
   - Click "Connect" or "Add Account"
   - Should redirect to OAuth consent screen
   - Should request permissions from scratch (not auto-approve)

---

## Testing Specific Providers

### Gmail

1. Delete Gmail account
2. Go to [Google Account Permissions](https://myaccount.google.com/permissions)
3. Verify ChainReact is no longer listed (or shows "No access")
4. Try to reconnect - should see full OAuth consent screen

### Slack

1. Delete Slack account
2. Go to Slack workspace → Settings & administration → Apps
3. Verify ChainReact is removed from installed apps
4. Try to reconnect - should request workspace authorization

### GitHub

1. Delete GitHub account
2. Go to [GitHub Settings → Applications](https://github.com/settings/applications)
3. Verify ChainReact shows "No active tokens"
4. Try to reconnect - should see authorization screen

### Discord

1. Delete Discord account
2. Go to [Discord Authorized Apps](https://discord.com/settings/authorized-apps)
3. Verify ChainReact is no longer listed
4. Try to reconnect - should request permissions

---

## Error Scenarios

### Test 1: Network Failure

1. Open DevTools → Network tab
2. Set throttling to "Offline"
3. Try to delete account
4. Should see:
   - Account disappears
   - Then reappears after timeout (~8 seconds)
   - Error message: "Failed to delete account: ..."

### Test 2: Permission Denied

1. Create team integration (admin user)
2. Log in as non-admin user
3. Try to delete team integration
4. Should see:
   - Permission denied error
   - Account NOT removed from UI
   - Suggestion to contact admin

### Test 3: Multiple Accounts

1. Connect 2 Gmail accounts (personal + work)
2. Delete one account
3. Verify:
   - Deleted account removed from dropdown
   - Other account still appears
   - Can select the remaining account
   - Can add another account

---

## Expected API Responses

### Successful Deletion

```json
{
  "success": true,
  "message": "gmail integration disconnected successfully"
}
```

### Permission Denied

```json
{
  "success": false,
  "error": "You don't have permission to disconnect this integration",
  "admins": [
    {
      "name": "Admin User",
      "email": "admin@example.com"
    }
  ],
  "suggestion": "Contact Admin User to disconnect this integration"
}
```

### Not Found

```json
{
  "success": false,
  "error": "Integration not found"
}
```

---

## Debugging

### Check Server Logs

Look for these log entries:

```
[ServiceConnectionSelector] Account deleted successfully { connectionId: '...', provider: 'gmail' }
🔐 [DELETE /api/integrations/xxx] Revoking OAuth token for gmail
✅ Successfully revoked gmail OAuth token
✅ [DELETE /api/integrations/xxx] Integration gmail disconnected by user yyy
```

### Check Browser Console

Should NOT see:

- TypeScript errors
- Network errors
- Component render errors

Should see:

- `[ServiceConnectionSelector] Fetching all connections { providerId: 'gmail' }`
- `[ServiceConnectionSelector] Fetched connections { providerId: 'gmail', count: 2 }`
- `[ServiceConnectionSelector] Account deleted successfully`

### Check Network Tab

DELETE request to `/api/integrations/{id}`:

- **Request Headers:**
  - `Authorization: Bearer {token}`
- **Response:** 200 OK
- **Response Body:** `{ success: true, message: "..." }`

---

## Verification Checklist

After testing, verify:

- [ ] X button appears on account dropdown
- [ ] Clicking X shows confirmation dialog
- [ ] Dialog explains revocation and re-auth requirement
- [ ] Confirming deletion removes account immediately
- [ ] Server logs show revocation attempt
- [ ] Account cannot be reselected after deletion
- [ ] Reconnecting requires fresh OAuth flow
- [ ] Provider shows no active permissions (if supported)
- [ ] Multiple accounts work correctly (delete one, keep others)
- [ ] Error handling works (network failure, permission denied)
- [ ] No TypeScript/console errors

---

## Manual Revocation (Providers Without Automatic Support)

For providers that don't support automatic revocation:

### Notion

1. Go to [Notion → Settings & Members → My Connections](https://www.notion.so/my-integrations)
2. Find ChainReact
3. Click "Disconnect"

### Airtable

1. Go to [Airtable → Account](https://airtable.com/account)
2. Click "Connected Apps"
3. Find ChainReact and revoke access

### Shopify

1. Go to Shopify Admin → Apps
2. Find ChainReact
3. Click "Uninstall"

---

## Success Criteria

✅ **UI/UX:**
- Account disappears immediately after confirmation
- No loading state (optimistic update)
- Error message shows if deletion fails
- Account reappears if deletion fails

✅ **Security:**
- OAuth tokens revoked for supported providers
- Reconnection requires fresh authorization
- Provider shows no active permissions

✅ **Reliability:**
- Deletion succeeds even if revocation fails
- User intent honored (deletion not blocked)
- Proper error handling and rollback

✅ **Documentation:**
- Clear confirmation dialog
- Explains what will happen
- Mentions permission revocation
