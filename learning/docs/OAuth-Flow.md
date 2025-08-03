---
title: OAuth Flow Implementation
date: 2024-12-19
component: OAuth
---

# OAuth Flow Implementation

## Overview

The application implements a comprehensive OAuth 2.0 flow for multiple providers including Google, Discord, Slack, GitHub, and others. The implementation follows OAuth 2.0 best practices with additional security measures.

## Architecture

### Key Components

1. **OAuth URL Generation** (`app/api/integrations/auth/generate-url/route.ts`)
2. **Callback Handlers** (`app/api/integrations/[provider]/callback/route.ts`)
3. **Token Management** (`lib/integrations/tokenUtils.ts`)
4. **Configuration** (`lib/integrations/oauthConfig.ts`)
5. **Client-side Auth Store** (`stores/authStore.ts`)
6. **Server-side Google Sign-In** (`app/actions/google-auth.ts`)

### Environment Variables

**Server-side (no prefix needed):**
- `GOOGLE_CLIENT_ID` - Used in API routes, callbacks, and server actions
- `GOOGLE_CLIENT_SECRET` - Used for token exchange
- `ENCRYPTION_KEY` - Used for token encryption

**Note**: All OAuth flows now use server-side environment variables for enhanced security.

## Security Features

### ✅ Implemented

1. **Token Encryption**
   - AES-256-CBC encryption for all OAuth tokens
   - Consistent encryption across all providers
   - Fallback scripts for existing unencrypted tokens

2. **CSRF Protection**
   - State parameter validation in all callbacks
   - Database storage using `pkce_flow` table
   - Proper cleanup after verification

3. **Error Handling**
   - Comprehensive error responses via `createPopupResponse`
   - Detailed logging throughout the flow
   - User-friendly error messages

4. **Security Headers**
   - Proper content-type headers
   - Origin validation in postMessage

5. **Server-Side OAuth**
   - Google Sign-In uses server action for OAuth URL generation
   - No client-side environment variable exposure
   - Consistent with integration OAuth patterns

### ⚠️ Areas for Improvement

1. **PKCE Implementation**
   - Currently inconsistent across providers
   - Twitter implements PKCE, others don't
   - Recommendation: Implement PKCE for all supported providers

2. **State Parameter Security**
   - Using base64 encoding instead of cryptographically secure random
   - Recommendation: Use `crypto.randomBytes(32).toString('hex')`

3. **Rate Limiting**
   - Missing rate limiting on OAuth endpoints
   - Recommendation: Implement rate limiting middleware

4. **Token Refresh Security**
   - No validation of refresh token scope
   - No token rotation implementation

## Common Issues and Fixes

### Environment Variable Issues

**Problem:** `client_id=undefined` in OAuth URL
**Cause:** Using `process.env.GOOGLE_CLIENT_ID` on client-side without `NEXT_PUBLIC_` prefix
**Solution:** 
1. Use server-side OAuth flow (implemented)
2. Only need `GOOGLE_CLIENT_ID` (server-side)
3. No `NEXT_PUBLIC_` prefix required

### Token Encryption Issues

**Problem:** Decryption failures during token refresh
**Cause:** Inconsistent token encryption across callbacks
**Solution:** 
1. Use `encryptTokens()` utility function
2. Run `scripts/fix-unencrypted-tokens.ts` for existing tokens

### Database Schema Issues

**Problem:** "Could not find the 'user_id' column of 'pkce_flow'"
**Cause:** Attempting to insert non-existent column
**Solution:** 
1. `pkce_flow` table only has: `state`, `code_verifier`, `provider`
2. Remove any references to non-existent columns

## Best Practices

### Environment Variables
- Use server-side environment variables for all OAuth flows
- Keep secrets server-side only
- Validate environment variables on startup

### Security
- Always validate state parameters
- Encrypt sensitive tokens before database storage
- Implement proper error handling
- Use HTTPS in production
- Use server-side OAuth URL generation

### Token Management
- Implement automatic token refresh
- Handle token expiration gracefully
- Store tokens securely with encryption

## Provider-Specific Configurations

### Google Services
- Shared Client ID across all Google services
- Different scopes for different services (Gmail, Drive, Calendar, etc.)
- Refresh tokens don't expire unless revoked
- **Google Sign-In**: Uses server action for OAuth URL generation

### Discord
- Requires specific scopes: `identify email connections guilds guilds.members.read`
- Doesn't support scope in refresh requests

### Facebook
- Long-lived tokens (60 days)
- Uses `fb_exchange_token` for refresh

## Debugging

### Environment Variable Debugging
```typescript
// Server-side debugging
console.log('Client ID:', process.env.GOOGLE_CLIENT_ID)
```

### OAuth URL Debugging
```typescript
// Check generated OAuth URL
console.log('OAuth URL:', authUrl)
```

### Token Debugging
```typescript
// Check if token is encrypted
const isEncrypted = token.includes(':')
```

### Database Schema Debugging
```typescript
// Check pkce_flow table structure
const { data, error } = await supabase
  .from('pkce_flow')
  .select('*')
  .limit(1)
```

## Related Files

- `app/api/integrations/auth/generate-url/route.ts` - OAuth URL generation
- `app/actions/google-auth.ts` - Server-side Google Sign-In
- `stores/authStore.ts` - Client-side OAuth handling
- `lib/integrations/oauthConfig.ts` - Provider configurations
- `lib/security/encryption.ts` - Token encryption
- `lib/utils/createPopupResponse.ts` - Error handling 