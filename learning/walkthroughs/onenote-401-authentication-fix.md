# OneNote 401 Authentication Error Fix

## Problem
OneNote API calls were returning 401 "The request does not contain a valid authentication token" errors, even though:
- The token was not expired
- The token worked for other Microsoft Graph endpoints (/me, /drive)
- The token was properly decrypted

## Root Cause
The access token stored in the database was missing the `Notes.ReadWrite.All` scope required for OneNote API access. This happened because:
1. The initial OAuth connection might have been made without requesting OneNote-specific scopes
2. Microsoft's OAuth flow returns an opaque token (not a JWT) when refreshing with different scopes than originally granted

## Investigation Process

### 1. Token Validation Test
Created `test-onenote-auth.mjs` to verify:
- Token decryption was working correctly
- Token was valid for general Microsoft Graph API
- Token failed specifically for OneNote endpoints

### 2. Scope Analysis
Created `test-onenote-scopes.mjs` to:
- Decode JWT tokens to inspect scopes
- Test different Microsoft Graph endpoints
- Attempt token refresh with correct scopes

### 3. Key Findings
- Current token works for `/me` and `/drive` endpoints ✅
- Current token fails for `/me/onenote/*` endpoints ❌
- Token refresh returns an opaque token (not JWT) that still lacks OneNote permissions
- The app registration needs explicit OneNote API permissions

## Solution

### Immediate Fix (User Action Required)
The user needs to reconnect their Microsoft/OneNote account:
1. Disconnect the current OneNote integration
2. Reconnect using the OAuth flow
3. Ensure the consent screen shows OneNote permissions

### Code Improvements Implemented

#### 1. Better Error Handling in `tryMultipleOneNoteEndpoints`
```typescript
// Don't treat empty results as errors - user might simply have no notebooks
if (data.value && data.value.length > 0) {
  return { data: data.value, error: undefined }
} else {
  console.log('⚠️ OneNote API returned empty data, trying next endpoint...')
  // Continue to next endpoint instead of returning empty
}
```

#### 2. Improved OneNote Options Loader
- Fixed interface implementation (added `canHandle` and `loadOptions` methods)
- Registered for both 'microsoft-onenote' and 'onenote' provider IDs
- Added helpful messages when no notebooks found or authentication fails

#### 3. Conditional Field Display
Added `hidden: true` and `dependsOn: "notebookId"` to fields in OneNote create page action, so only the notebook field shows initially.

### Long-term Fix (Development)

#### 1. Verify OAuth Configuration
Ensure `/lib/integrations/oauthConfig.ts` has correct scopes:
```javascript
scope: "offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Notes.ReadWrite.All"
```

#### 2. App Registration Requirements
The Microsoft Azure app registration must have:
- Microsoft Graph API permissions
- `Notes.ReadWrite.All` delegated permission
- Admin consent (if required by organization)

#### 3. Token Validation on Connection
Add validation when connecting integrations to ensure the token has required scopes:
```javascript
// Decode token and check for Notes.ReadWrite scope
const tokenParts = accessToken.split('.')
if (tokenParts.length === 3) {
  const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
  const hasNotesScope = payload.scp?.includes('Notes')
  if (!hasNotesScope) {
    throw new Error('Token missing OneNote permissions. Please reconnect.')
  }
}
```

## Prevention

1. **Always validate token scopes** after OAuth callback
2. **Show clear permission requirements** in the UI before connection
3. **Implement automatic token refresh** with scope validation
4. **Add integration health checks** that verify API access periodically

## Testing
Use the test scripts created:
- `test-onenote-auth.mjs` - Basic authentication testing
- `test-onenote-scopes.mjs` - Detailed scope analysis and token refresh

## Related Files Modified
- `/app/api/integrations/onenote/data/utils.ts` - Fixed token validation
- `/components/workflows/configuration/providers/onenote/optionsLoader.ts` - Fixed interface
- `/components/workflows/configuration/providers/registry.ts` - Added dual registration
- `/lib/workflows/nodes/providers/onenote/index.ts` - Added conditional fields