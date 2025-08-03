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

### Environment Variables

**Client-side (NEXT_PUBLIC_ prefix required):**
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Used in authStore.ts for OAuth URL generation

**Server-side (no prefix needed):**
- `GOOGLE_CLIENT_ID` - Used in API routes and callbacks
- `GOOGLE_CLIENT_SECRET` - Used for token exchange
- `ENCRYPTION_KEY` - Used for token encryption

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
1. Change environment variable to `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
2. Update client-side code to use the new variable name
3. Redeploy application

### Token Encryption Issues

**Problem:** Decryption failures during token refresh
**Cause:** Inconsistent token encryption across callbacks
**Solution:** 
1. Use `encryptTokens()` utility function
2. Run `scripts/fix-unencrypted-tokens.ts` for existing tokens

## Best Practices

### Environment Variables
- Use `NEXT_PUBLIC_` prefix for client-side variables
- Keep secrets server-side only
- Validate environment variables on startup

### Security
- Always validate state parameters
- Encrypt sensitive tokens before database storage
- Implement proper error handling
- Use HTTPS in production

### Token Management
- Implement automatic token refresh
- Handle token expiration gracefully
- Store tokens securely with encryption

## Provider-Specific Configurations

### Google Services
- Shared Client ID across all Google services
- Different scopes for different services (Gmail, Drive, Calendar, etc.)
- Refresh tokens don't expire unless revoked

### Discord
- Requires specific scopes: `identify email connections guilds guilds.members.read`
- Doesn't support scope in refresh requests

### Facebook
- Long-lived tokens (60 days)
- Uses `fb_exchange_token` for refresh

## Debugging

### Environment Variable Debugging
```typescript
// Add to any component to debug
console.log('Client ID:', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)
```

### OAuth URL Debugging
```typescript
// Check generated OAuth URL
console.log('OAuth URL:', googleOAuthUrl)
```

### Token Debugging
```typescript
// Check if token is encrypted
const isEncrypted = token.includes(':')
```

## Related Files

- `app/api/integrations/auth/generate-url/route.ts` - OAuth URL generation
- `stores/authStore.ts` - Client-side OAuth handling
- `lib/integrations/oauthConfig.ts` - Provider configurations
- `lib/security/encryption.ts` - Token encryption
- `lib/utils/createPopupResponse.ts` - Error handling 