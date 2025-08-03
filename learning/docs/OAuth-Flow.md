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

**Server-side Only:**
- `GOOGLE_CLIENT_ID` - Used for server-side OAuth URL generation
- `GOOGLE_CLIENT_SECRET` - Used for token exchange (never exposed to client)
- `[PROVIDER]_CLIENT_ID` - For other OAuth providers
- `[PROVIDER]_CLIENT_SECRET` - For other OAuth providers

## Security Features

### 1. Token Encryption (9/10)
- **Implementation**: AES-256-CBC encryption for all OAuth tokens
- **Storage**: Encrypted tokens stored in database
- **Key Management**: Encryption keys stored as environment variables

### 2. CSRF Protection (8/10)
- **State Parameter**: Random state parameter generated for each OAuth request
- **Verification**: State verified in all callback handlers
- **Storage**: State stored in database for server-side verification

### 3. COOP Policy Compatibility (9/10)
- **Dual-Channel Communication**: Uses both postMessage and localStorage
- **Fallback Mechanism**: Gracefully handles COOP policy restrictions
- **Error Handling**: Proper error handling for security restrictions

### 4. Error Handling (7/10)
- **User Feedback**: Clear error messages shown to users
- **Logging**: Comprehensive error logging
- **Recovery**: Automatic retry mechanisms for token refresh

## Provider-Specific Configurations

### Google Services
```typescript
{
  id: "google-calendar",
  name: "Google Calendar",
  clientIdEnv: "GOOGLE_CLIENT_ID",
  clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revokeEndpoint: "https://oauth2.googleapis.com/revoke",
  refreshRequiresClientAuth: true,
  authMethod: "body",
  refreshTokenExpirationSupported: false,
  accessTokenExpiryBuffer: 30,
  sendRedirectUriWithRefresh: true,
  redirectUriPath: "/api/integrations/google-calendar/callback",
}
```

## Common Issues and Solutions

### 1. "The OAuth client was not found"
- **Cause**: Missing or undefined client ID
- **Solution**: Ensure server-side OAuth URL generation with proper environment variables

### 2. Cross-Origin-Opener-Policy Errors
- **Cause**: Browser security policies blocking popup communication
- **Solution**: Use localStorage for communication and add COOP headers in next.config.mjs

### 3. "State parameter doesn't match"
- **Cause**: Stale or missing state parameter
- **Solution**: Ensure state is properly generated and stored

### 4. "Redirect URI mismatch"
- **Cause**: Misconfigured redirect URIs in OAuth provider console
- **Solution**: Verify redirect URIs match exactly between app and provider console

## Best Practices

1. **Use server-side OAuth URL generation** - More secure than client-side
2. **Implement multiple communication channels** - For browser compatibility
3. **Store state in database** - For secure verification
4. **Encrypt all sensitive tokens** - Never store plaintext tokens
5. **Implement proper error handling** - For better user experience

## Debugging

### Debug Endpoints
- `/api/debug-oauth` - Check environment variables
- `/api/test-oauth-url` - Generate and inspect OAuth URLs

### Browser Console
Check for:
- COOP policy errors
- postMessage communication issues
- localStorage access errors

## Implementation Examples

### Server-side OAuth URL Generation
```typescript
export async function initiateGoogleSignIn() {
  // Generate secure state parameter
  const state = crypto.randomBytes(32).toString('hex')
  
  // Generate OAuth URL server-side
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${getBaseUrl()}/api/auth/callback`,
    response_type: "code",
    scope: "email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  })

  return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }
}
```

### COOP-Safe Communication
```typescript
// Popup window
try {
  localStorage.setItem(storageKey, JSON.stringify(responseData));
} catch (e) {
  console.error('Failed to store in localStorage:', e);
}

// Main window
const storageCheckTimer = setInterval(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(storageCheckPrefix)) {
      const responseData = JSON.parse(localStorage.getItem(key)!);
      // Process response...
      localStorage.removeItem(key); // Clean up
    }
  }
}, 500);
```