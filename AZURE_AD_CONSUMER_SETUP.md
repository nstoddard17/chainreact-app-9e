# Azure AD Configuration for Consumer Accounts (2024)

## The Issue
You're trying to use OneNote API with a Gmail-based Microsoft account (consumer account), but getting 401 errors. This is a known issue with OneNote API and personal Microsoft accounts.

## Current Status (Late 2024)
**Important**: Microsoft has confirmed there are **API Scope Limitations** for personal accounts using delegated permissions with the OneNote API. This is a known issue that Microsoft is aware of but hasn't fully resolved.

## Solution: Configure Azure AD for Multi-Tenant + Personal Accounts

### Step 1: Update Supported Account Types
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Find your app (Client ID: `972dec38-eeca-4cef-afcf-6d47e3cd8531`)
4. Click on **Authentication** in the left menu
5. Under **Supported account types**, select:
   - **"Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"**
   - This is also labeled as **"AzureADandPersonalMicrosoftAccount"**

### Step 2: Update Application Manifest
1. In your app registration, click on **Manifest**
2. Find the line: `"signInAudience": "AzureADMyOrg"` (or similar)
3. Change it to: `"signInAudience": "AzureADandPersonalMicrosoftAccount"`
4. Click **Save**

### Step 3: Update Redirect URIs
1. Still in **Authentication**
2. Make sure your redirect URIs are configured as:
   - Type: **Web**
   - URIs: 
     - `http://localhost:3000/api/integrations/onenote/callback` (for development)
     - `https://chainreact.app/api/integrations/onenote/callback` (for production)
3. Under **Advanced settings**:
   - Enable **"Access tokens"** (used for implicit flows)
   - Enable **"ID tokens"** (used for implicit and hybrid flows)

### Step 4: Verify API Permissions
1. Click on **API permissions**
2. Ensure you have these Microsoft Graph permissions:
   - `User.Read` (Delegated)
   - `Files.Read` (Delegated)
   - `Notes.Create` (Delegated)
   - `Notes.Read` (Delegated)
   - `Notes.ReadWrite` (Delegated)
   - `Notes.ReadWrite.All` (Delegated)
   - `offline_access` (Delegated)
3. Click **"Grant admin consent"** if you're an admin

### Step 5: Update Token Configuration
1. Click on **Token configuration**
2. Add optional claims if needed:
   - Add **"email"** claim
   - Add **"preferred_username"** claim

### Step 6: Wait for Propagation
Azure AD changes can take **10-15 minutes** to fully propagate.

## Known Issues & Workarounds

### Issue 1: OneNote API Still Returns 401
**This is a known Microsoft issue**. As of late 2024, the OneNote API has limitations with personal Microsoft accounts. Microsoft has acknowledged this but hasn't provided a complete fix.

**Workaround Options:**
1. **Use a work/school account** for full OneNote API access
2. **Use an @outlook.com account** instead of Gmail (sometimes works better)
3. **Wait for Microsoft to fix** the API scope limitations

### Issue 2: AADSTS650052 Error
If you get "Your organization lacks a service principal for OneNote":
1. Sign into OneNote.com with the account
2. This provisions the OneNote service for that account
3. Try the integration again

## Testing Your Configuration

After making these changes:

1. **Clear all cookies** for:
   - `login.microsoftonline.com`
   - `login.live.com`
   - `login.windows.net`

2. **Reconnect OneNote** in ChainReact:
   - Disconnect the existing integration
   - Connect again
   - The consent screen should now say:
     - "This app will work with your personal Microsoft account"
     - "This app will work with your work or school account"

3. **Run the test**:
   ```bash
   node test-onenote-fresh.mjs
   ```

## Alternative: Azure AD B2C (Not Recommended)
Azure AD B2C was previously used for consumer scenarios but:
- **Effective May 1, 2025**, Azure AD B2C will no longer be available for new customers
- It's more complex to set up
- The multi-tenant approach above is now recommended

## Code Changes Needed

None! Your code is already correct. The issue is purely with Azure AD configuration and Microsoft's OneNote API limitations for consumer accounts.

## Important Notes

1. **Token Version**: With multi-tenant + personal accounts, your app will receive v2.0 tokens
2. **Issuer Validation**: Your app should accept tokens from multiple issuers
3. **Service Principal**: A service principal is created in each tenant when users first consent

## If It Still Doesn't Work

Unfortunately, due to Microsoft's acknowledged limitations with OneNote API and personal accounts, it may not work even with correct configuration. Your options are:

1. **Document the limitation** for users
2. **Recommend work/school accounts** for OneNote features
3. **Wait for Microsoft** to fix the API limitations
4. **Consider alternative approaches** like using OneDrive API to access OneNote files

## References
- [Microsoft Q&A: Persistent 401 for OneNote API with Personal Accounts](https://learn.microsoft.com/en-us/answers/questions/2278657/)
- [Supported Account Types Documentation](https://learn.microsoft.com/en-us/entra/identity-platform/v2-supported-account-types)
- [Identity and Account Types for Apps](https://learn.microsoft.com/en-us/security/zero-trust/develop/identity-supported-account-types)