# OneNote API Setup Guide

## Problem Diagnosis
The OneNote API returns 401 "The request does not contain a valid authentication token" errors even though:
- The token is properly decrypted ✅
- The token works for other Microsoft Graph endpoints (`/me`, `/drive`) ✅
- The token refresh includes `Notes.ReadWrite.All` scope in the request ✅

## Root Cause
The Microsoft Azure App Registration doesn't have OneNote API permissions configured. Even though we request the `Notes.ReadWrite.All` scope, Microsoft won't grant it unless the app registration has been configured with this permission.

## Solution: Configure Azure App Registration

### Step 1: Access Azure Portal
1. Go to https://portal.azure.com
2. Navigate to "Azure Active Directory" > "App registrations"
3. Find your app (should match the Client ID: `972dec38...` from your .env)

### Step 2: Add OneNote API Permissions
1. Click on your app registration
2. Go to "API permissions" in the left sidebar
3. Click "Add a permission"
4. Select "Microsoft Graph"
5. Choose "Delegated permissions"
6. Search for "Notes" or scroll to find OneNote permissions
7. Check the following permissions:
   - `Notes.Create` - Create OneNote pages
   - `Notes.Read` - Read OneNote content
   - `Notes.ReadWrite` - Full read/write access to OneNote
   - `Notes.ReadWrite.All` - Full access to all OneNote content user can access
8. Click "Add permissions"

### Step 3: Grant Admin Consent (if required)
1. If you see a warning about admin consent, click "Grant admin consent for [Your Organization]"
2. Confirm the consent

### Step 4: Verify Permissions
Your API permissions should now show:
- `User.Read` (for basic profile)
- `Files.Read` (for file access)
- `Notes.ReadWrite.All` (for OneNote) ✅
- `offline_access` (for refresh tokens)

### Step 5: Wait for Propagation
Azure AD changes can take 5-10 minutes to propagate. Wait a few minutes before testing.

### Step 6: Reconnect OneNote in ChainReact
1. Go to your integrations page
2. Disconnect OneNote if connected
3. Reconnect OneNote
4. When prompted by Microsoft, you should now see OneNote permissions in the consent screen
5. Grant all requested permissions

## Testing
After completing the setup, test with:
```bash
node test-onenote-manual.mjs
```

You should see:
- ✅ User Profile endpoint works
- ✅ OneDrive endpoint works
- ✅ OneNote Service Root works
- ✅ OneNote Notebooks endpoint works

## Common Issues

### Issue: Still getting 401 after adding permissions
**Solution**: The existing tokens don't have the new permissions. You must:
1. Disconnect the integration
2. Clear browser cookies for login.microsoftonline.com
3. Reconnect the integration
4. Ensure the consent screen shows OneNote permissions

### Issue: No "Notes" permissions in Microsoft Graph
**Solution**: Make sure you're looking under "Microsoft Graph" API, not "OneNote" API. The modern way is through Microsoft Graph.

### Issue: "Admin consent required" warning
**Solution**: If you're not an admin, ask your Azure AD administrator to grant consent for the OneNote permissions.

## Alternative: Personal Microsoft Account
If you're using a personal Microsoft account (not organizational):
1. Go to https://account.live.com/consent/Manage
2. Find the ChainReact app
3. Remove it
4. Reconnect in ChainReact to re-grant permissions

## Environment Variables Required
Ensure these are set in your `.env.local`:
```
ONENOTE_CLIENT_ID=your-client-id
ONENOTE_CLIENT_SECRET=your-client-secret
```

Or if using shared Microsoft credentials:
```
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
```

## API Scopes Explanation
- `User.Read` - Basic profile information
- `Files.Read` - Access to OneDrive files (OneNote notebooks are stored in OneDrive)
- `Notes.Create` - Create new OneNote content
- `Notes.Read` - Read existing OneNote content
- `Notes.ReadWrite` - Full read/write access to OneNote
- `Notes.ReadWrite.All` - Access all OneNote content the user can access
- `offline_access` - Refresh tokens for long-term access

## Important Note
The token itself is working correctly (it authenticates with Microsoft Graph for user profile and OneDrive). The issue is specifically that the app registration lacks OneNote API permissions. This must be fixed in Azure AD, not in the code.