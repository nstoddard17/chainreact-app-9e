---
title: OAuth Flow Walkthrough
date: 2024-12-19
component: OAuth
---

# OAuth Flow Walkthrough

## Flow Overview

The OAuth implementation follows a standard OAuth 2.0 authorization code flow with additional security measures. Here's the complete flow:

## 1. OAuth URL Generation

### Client-Side Initiation
```typescript
// stores/authStore.ts - signInWithGoogle()
const params = new URLSearchParams({
  client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
  redirect_uri: `${getBaseUrl()}/api/auth/callback`,
  response_type: 'code',
  scope: 'email profile',
  state: state,
  access_type: 'offline',
  prompt: 'consent',
})
```

**Key Points:**
- Uses `NEXT_PUBLIC_` prefix for client-side environment variable access
- Generates random state parameter for CSRF protection
- Stores state in sessionStorage for verification

### Server-Side URL Generation
```typescript
// app/api/integrations/auth/generate-url/route.ts
function generateGoogleAuthUrl(service: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID // Server-side access
  // ... build OAuth URL with service-specific scopes
}
```

**Service-Specific Scopes:**
- Gmail: `https://www.googleapis.com/auth/gmail.modify`
- Drive: `https://www.googleapis.com/auth/drive`
- Calendar: `https://www.googleapis.com/auth/calendar`
- Sheets: `https://www.googleapis.com/auth/spreadsheets`

## 2. State Management and Security

### PKCE Flow Implementation
```typescript
// For providers that support PKCE (Twitter, Instagram, etc.)
const codeVerifier = crypto.randomBytes(32).toString("hex")
const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")

// Store in database for verification
await supabase.from("pkce_flow").insert({ 
  state, 
  code_verifier: codeVerifier,
  provider: "twitter" 
})
```

### State Parameter Structure
```typescript
const stateObject = {
  userId: user.id,
  provider,
  reconnect,
  integrationId,
  timestamp: Date.now(),
}
const state = btoa(JSON.stringify(stateObject))
```

## 3. Callback Processing

### Standard Callback Flow
```typescript
// app/api/integrations/[provider]/callback/route.ts
export async function GET(request: NextRequest) {
  const { code, state, error } = extractParams(request)
  
  // 1. Handle OAuth errors
  if (error) return createPopupResponse('error', provider, error)
  
  // 2. Validate state parameter
  const { data: pkceData } = await supabase
    .from('pkce_flow')
    .select('*')
    .eq('state', state)
    .single()
  
  // 3. Exchange code for tokens
  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
    })
  })
  
  // 4. Encrypt and store tokens
  const integrationData = await prepareIntegrationData(
    userId,
    provider,
    tokenData.access_token,
    tokenData.refresh_token,
    scopes,
    expiresIn
  )
}
```

## 4. Token Encryption

### Encryption Process
```typescript
// lib/security/encryption.ts
export function encrypt(text: string, key: string = ENCRYPTION_KEY): string {
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key.slice(0, 32)), iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  return iv.toString("hex") + ":" + encrypted
}
```

### Token Storage
```typescript
// lib/integrations/tokenUtils.ts
export async function prepareIntegrationData(
  userId: string,
  provider: string,
  accessToken: string,
  refreshToken?: string,
  scopes: string[] = [],
  expiresIn?: number,
  refreshTokenExpiresAt?: Date
) {
  const { encryptedAccessToken, encryptedRefreshToken } = await encryptTokens(accessToken, refreshToken)
  
  return {
    user_id: userId,
    provider,
    access_token: encryptedAccessToken,
    refresh_token: encryptedRefreshToken,
    scopes,
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    refresh_token_expires_at: refreshTokenExpiresAt,
  }
}
```

## 5. Token Refresh System

### Automatic Refresh Logic
```typescript
// lib/integrations/tokenRefreshService.ts
export async function refreshTokenIfNeeded(integrationId: string): Promise<boolean> {
  const integration = await getIntegration(integrationId)
  const config = getOAuthConfig(integration.provider)
  
  // Check if token needs refresh
  const timeUntilExpiry = integration.expires_at.getTime() - Date.now()
  const bufferTime = config.accessTokenExpiryBuffer * 60 * 1000 // Convert to milliseconds
  
  if (timeUntilExpiry <= bufferTime) {
    return await refreshToken(integrationId)
  }
  
  return true
}
```

### Refresh Token Exchange
```typescript
const refreshParams = new URLSearchParams({
  grant_type: 'refresh_token',
  refresh_token: decryptedRefreshToken,
  client_id: process.env[config.clientIdEnv],
})

if (config.refreshRequiresClientAuth) {
  refreshParams.append('client_secret', process.env[config.clientSecretEnv])
}

if (config.sendRedirectUriWithRefresh) {
  refreshParams.append('redirect_uri', redirectUri)
}
```

## 6. Error Handling

### Popup Response System
```typescript
// lib/utils/createPopupResponse.ts
export function createPopupResponse(
  type: "success" | "error",
  provider: string,
  message: string,
  baseUrl: string,
) {
  const script = `
    <script>
      if (window.opener) {
        window.opener.postMessage({
          type: 'oauth-${type}',
          provider: '${provider}',
          message: '${message}'
        }, '${baseUrl}');
        setTimeout(() => window.close(), 2000);
      }
    </script>
  `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}
```

## 7. Security Considerations

### CSRF Protection
- State parameter validation prevents cross-site request forgery
- Database storage ensures state integrity
- Proper cleanup prevents state reuse

### Token Security
- All tokens encrypted before database storage
- AES-256-CBC encryption with random IV
- Environment variable-based encryption key

### Error Handling
- Comprehensive error logging
- User-friendly error messages
- Graceful degradation on failures

## 8. Provider-Specific Implementations

### Google Services
- Shared client credentials across services
- Service-specific scopes
- Refresh tokens don't expire unless revoked

### Discord
- Requires specific scopes for bot functionality
- Doesn't support scope in refresh requests
- Uses PKCE for enhanced security

### Facebook
- Long-lived tokens (60 days)
- Uses `fb_exchange_token` for refresh
- Different token exchange flow

## 9. Integration Points

### Database Schema
```sql
-- integrations table
CREATE TABLE integrations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL, -- encrypted
  refresh_token TEXT, -- encrypted
  scopes TEXT[],
  expires_at TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- pkce_flow table for state management
CREATE TABLE pkce_flow (
  state TEXT PRIMARY KEY,
  code_verifier TEXT,
  provider TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Store Integration
```typescript
// stores/integrationStore.ts
const fetchIntegrations = async (silent = false) => {
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', currentUserId)
  
  // Decrypt tokens for use
  const decryptedIntegrations = data?.map(integration => ({
    ...integration,
    access_token: decrypt(integration.access_token),
    refresh_token: integration.refresh_token ? decrypt(integration.refresh_token) : null
  }))
}
```

## 10. Performance Optimizations

### Lazy Loading
- Integration data loaded on demand
- Background token refresh
- Minimal initial data loading

### Caching
- Token refresh results cached
- Integration list cached in store
- Optimistic UI updates

### Error Recovery
- Automatic retry on token refresh failure
- Fallback to unencrypted tokens if encryption fails
- Graceful degradation on provider errors

## Common Issues and Solutions

### Environment Variable Issues
**Problem:** `client_id=undefined`
**Solution:** Use `NEXT_PUBLIC_` prefix for client-side variables

### Token Decryption Failures
**Problem:** Inconsistent token encryption
**Solution:** Run `scripts/fix-unencrypted-tokens.ts`

### State Validation Failures
**Problem:** Invalid state parameter
**Solution:** Check `pkce_flow` table and cleanup procedures

### Token Refresh Failures
**Problem:** Expired refresh tokens
**Solution:** Implement proper error handling and user re-authentication 