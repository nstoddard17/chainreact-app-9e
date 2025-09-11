# OneNote 401 Error - Final Solution

## Confirmed Issue
After extensive testing, the OneNote API consistently returns 401 "The request does not contain a valid authentication token" errors because **the Azure AD app registration lacks OneNote API permissions**.

## Test Results
- ✅ Token decryption works correctly
- ✅ Token authenticates successfully for:
  - `/me` (User profile)
  - `/drive` (OneDrive files)
- ❌ Token fails for ALL OneNote endpoints:
  - `/me/onenote/notebooks`
  - `/me/onenote/sections`
  - `/me/onenote/pages`
  - Even legacy `onenote.com/api` endpoints

## Root Cause
The Microsoft Azure AD app registration (Client ID: `972dec38-eeca-4cef-afcf-6d47e3cd8531`) does not have OneNote permissions configured. Even though the code requests `Notes.ReadWrite.All` scope, Microsoft will NOT grant this scope unless the app registration explicitly has this permission.

## THE SOLUTION

### Step 1: Add OneNote Permissions in Azure AD

1. **Access Azure Portal**
   - Go to https://portal.azure.com
   - Sign in with the account that created the app registration

2. **Navigate to Your App**
   - Go to "Azure Active Directory" → "App registrations"
   - Find your app (Client ID: `972dec38-eeca-4cef-afcf-6d47e3cd8531`)

3. **Add API Permissions**
   - Click on "API permissions" in the left menu
   - Click "Add a permission"
   - Choose "Microsoft Graph"
   - Select "Delegated permissions"
   - Search for "Notes" in the search box
   - Check these permissions:
     - `Notes.Create`
     - `Notes.Read`
     - `Notes.ReadWrite`
     - `Notes.ReadWrite.All` ✅ (Most important)
   - Click "Add permissions"

4. **Grant Admin Consent** (if you're an admin)
   - Click "Grant admin consent for [Your Organization]"
   - Confirm the action

5. **Verify Permissions**
   Your permissions list should show:
   - `User.Read` ✅
   - `Files.Read` ✅
   - `Notes.ReadWrite.All` ✅ (Currently missing!)
   - `offline_access` ✅

### Step 2: Wait for Propagation
Azure AD changes take 5-15 minutes to propagate. Be patient.

### Step 3: Reconnect OneNote in ChainReact

1. **Clear the old integration**
   - Go to your integrations page
   - Disconnect OneNote completely
   - Clear browser cookies for `login.microsoftonline.com`

2. **Reconnect with new permissions**
   - Click "Connect" for OneNote
   - **IMPORTANT**: The Microsoft consent screen should now show:
     - "Access your notebooks"
     - "Create new pages in your notebooks"
     - "Read and write to your notebooks"
   - If you don't see these permissions, the Azure AD changes haven't propagated yet

3. **Grant all permissions**
   - Click "Accept" on the consent screen

### Step 4: Verify It Works
Check the server logs when connecting. You should see:
```
🔍 OneNote OAuth callback - Token exchange successful
   Scopes returned: User.Read Files.Read Notes.ReadWrite.All offline_access
```

## Alternative: If You Can't Access Azure AD

If you don't have access to the Azure AD app registration, you have two options:

### Option A: Create Your Own App Registration
1. Go to https://portal.azure.com
2. Create a new app registration
3. Add all required permissions (including OneNote)
4. Update your `.env.local`:
   ```
   ONENOTE_CLIENT_ID=your-new-client-id
   ONENOTE_CLIENT_SECRET=your-new-client-secret
   ```

### Option B: Use Personal Microsoft Account App
1. Go to https://apps.dev.microsoft.com
2. Register a new application
3. Add OneNote permissions
4. Use the Live SDK endpoints instead of Graph API

## Debugging Tools Created

- `test-onenote-manual.mjs` - Tests token and API access
- `test-onenote-deeper.mjs` - Deep investigation of token scopes
- `test-onenote-scopes.mjs` - Token refresh and scope analysis

Run these after making changes to verify the fix:
```bash
node test-onenote-manual.mjs
```

## Why This Happens

Microsoft's OAuth implementation has a critical security feature: even if you request scopes in your OAuth URL, Microsoft will ONLY grant scopes that the app registration has been configured to use. This prevents malicious apps from requesting permissions they shouldn't have.

Your current token has `User.Read` and `Files.Read` because those ARE configured in your app registration, but `Notes.ReadWrite.All` is NOT being granted because it's not in the app registration's API permissions.

## Verification

After fixing, the OneNote dropdowns should populate with your notebooks, and you'll be able to create pages and perform other OneNote operations through ChainReact.