# HubSpot Token Decryption Fix

**Date**: September 10, 2025
**Issue**: HubSpot API calls failing with "Failed to fetch HubSpot hubspot_lists" error
**Root Cause**: Access token wasn't being decrypted before use

## Problem

When trying to load HubSpot lists in the dropdown, the API was failing with authentication errors even though the integration was connected and had a valid token. The issue was that the stored access token is encrypted in the database, but the API was trying to use it directly without decryption.

## Solution

Fixed the `validateHubSpotToken` function in `/app/api/integrations/hubspot/data/utils.ts` to properly decrypt the access token before returning it.

### Before (lines 111-145):
```typescript
export async function validateHubSpotToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // Was returning the encrypted token directly!
    return {
      success: true,
      token: integration.access_token  // ❌ This was encrypted
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Token validation failed"
    }
  }
}
```

### After:
```typescript
export async function validateHubSpotToken(integration: any): Promise<{ success: boolean, token?: string, error?: string }> {
  try {
    if (!integration.access_token) {
      return {
        success: false,
        error: "No access token found"
      }
    }

    // Decrypt the access token
    const { decrypt } = await import('@/lib/security/encryption')
    let decryptedToken: string
    
    try {
      decryptedToken = await decrypt(integration.access_token)
    } catch (decryptError) {
      console.error('❌ [HubSpot] Failed to decrypt access token:', decryptError)
      return {
        success: false,
        error: "Failed to decrypt access token"
      }
    }

    // Return the decrypted token
    return {
      success: true,
      token: decryptedToken  // ✅ Now properly decrypted
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Token validation failed"
    }
  }
}
```

## Impact

This fix resolves all HubSpot API authentication issues for:
- Loading lists in the "Add Contact to List" action dropdown
- Loading companies in association fields
- Loading contacts in association fields
- Loading deals in the "Update Deal" action
- All other dynamic HubSpot data loading

## Key Learning

**Always remember that integration tokens are encrypted in the database**. Any handler that needs to use the token must:
1. Import the decrypt function from `@/lib/security/encryption`
2. Decrypt the token before using it in API calls
3. Handle decryption errors gracefully

## Files Modified

- `/app/api/integrations/hubspot/data/utils.ts` (lines 111-145)

## Related Files

All HubSpot data handlers that use this function benefit from the fix:
- `/app/api/integrations/hubspot/data/handlers/lists.ts`
- `/app/api/integrations/hubspot/data/handlers/companies.ts`
- `/app/api/integrations/hubspot/data/handlers/contacts.ts`
- `/app/api/integrations/hubspot/data/handlers/deals.ts`
- And all other handlers in that directory

## Testing

To verify the fix works:
1. Open a workflow in the builder
2. Add a HubSpot "Add Contact to List" action
3. Click on the List dropdown
4. Lists should load successfully showing manual lists with contact counts