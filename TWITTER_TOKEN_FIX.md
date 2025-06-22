# Twitter Token Refresh Fix

## Problem Summary

The error `"Value passed for the token was invalid"` was occurring because:

1. **Token Encryption Mismatch**: The Twitter OAuth callback was storing unencrypted refresh tokens in the database, but the token refresh system expected encrypted tokens.

2. **Missing Client ID**: The Twitter token refresh implementation was missing the `client_id` parameter in the request body, which is required by Twitter's OAuth specification.

3. **Inconsistent Token Handling**: Multiple OAuth callbacks were not encrypting tokens before storing them, causing decryption failures during token refresh.

## Root Cause

The issue was in the token storage flow:

1. **OAuth Callbacks** → Store unencrypted tokens in database
2. **Token Refresh System** → Expects encrypted tokens, fails to decrypt
3. **Twitter API** → Receives invalid/corrupted refresh token, returns "invalid token" error

## Solution Implemented

### 1. Fixed Twitter Token Refresh Implementation

**File**: `lib/integrations/tokenRefresher.ts`

- Added `client_id` parameter to the request body
- Improved error handling for invalid tokens
- Added specific handling for revoked tokens

### 2. Created Token Encryption Utility

**File**: `lib/integrations/tokenUtils.ts`

- `encryptTokens()`: Encrypts access and refresh tokens
- `prepareIntegrationData()`: Prepares integration data with encrypted tokens

### 3. Updated OAuth Callbacks

Updated the following callbacks to use consistent token encryption:

- `app/api/integrations/twitter/callback/route.ts`
- `app/api/integrations/slack/callback/route.ts`
- `app/api/integrations/teams/callback/route.ts`
- `app/api/integrations/onedrive/callback/route.ts`

### 4. Created Database Fix Script

**File**: `scripts/fix-unencrypted-tokens.ts`

- Identifies existing unencrypted tokens in the database
- Encrypts them properly
- Provides detailed reporting

## How to Apply the Fix

### 1. Run the Database Fix Script

\`\`\`bash
# Run the script to fix existing unencrypted tokens
npx tsx scripts/fix-unencrypted-tokens.ts
\`\`\`

### 2. Test the Token Refresh

\`\`\`bash
# Test the token refresh system
curl "https://your-domain.com/api/cron/refresh-tokens-simple?provider=twitter"
\`\`\`

### 3. Monitor the Results

Check the logs for successful token refreshes and any remaining issues.

## Verification

After applying the fix:

1. **New OAuth connections** will have properly encrypted tokens
2. **Existing tokens** will be encrypted by the fix script
3. **Token refresh** should work without "invalid token" errors
4. **Twitter integrations** should refresh successfully

## Prevention

To prevent this issue in the future:

1. **Always use** `prepareIntegrationData()` in new OAuth callbacks
2. **Test token refresh** after implementing new OAuth providers
3. **Monitor token refresh logs** for encryption-related errors
4. **Use the token utility functions** for consistent token handling

## Related Files Modified

- `lib/integrations/tokenRefresher.ts` - Fixed Twitter refresh implementation
- `lib/integrations/tokenUtils.ts` - New token encryption utilities
- `app/api/integrations/twitter/callback/route.ts` - Updated to encrypt tokens
- `app/api/integrations/slack/callback/route.ts` - Updated to encrypt tokens
- `app/api/integrations/teams/callback/route.ts` - Updated to encrypt tokens
- `app/api/integrations/onedrive/callback/route.ts` - Updated to encrypt tokens
- `scripts/fix-unencrypted-tokens.ts` - Database fix script

## Expected Outcome

After applying this fix:

- ✅ Twitter token refresh errors should be resolved
- ✅ All OAuth callbacks will encrypt tokens consistently
- ✅ Existing unencrypted tokens will be fixed
- ✅ Token refresh system will work reliably across all providers
