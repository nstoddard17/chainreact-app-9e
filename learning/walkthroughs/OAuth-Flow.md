---
title: OAuth Flow Walkthrough
date: 2024-12-19
component: OAuth
---

# OAuth Flow Walkthrough

## Flow Overview

The OAuth implementation follows a standard OAuth 2.0 authorization code flow with additional security measures. Here's the complete flow:

## 1. OAuth URL Generation

### Google Sign-In (Server-Side)
```typescript
// app/actions/google-auth.ts - initiateGoogleSignIn()
export async function initiateGoogleSignIn() {
  const supabase = createServerActionClient({ cookies })
  
  // Generate secure state parameter
  const state = crypto.randomBytes(32).toString('hex')
  
  // Store state in database for verification
  const { error: stateError } = await supabase
    .from('pkce_flow')
    .insert({ 
      state, 
      code_verifier: crypto.randomBytes(32).toString("hex"),
      provider: "google-signin"
    })

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

### Integration OAuth (Server-Side)
```typescript
// app/api/integrations/auth/generate-url/route.ts
export async function POST(request: NextRequest) {
  // Validate request and get provider
  const { provider } = await request.json()
  
  // Generate state parameter with user ID
  const state = btoa(JSON.stringify({ userId, timestamp: Date.now() }))
  
  // Generate provider-specific OAuth URL
  const authUrl = generateProviderAuthUrl(provider, state)
  
  return NextResponse.json({ success: true, authUrl })
}
```

## 2. OAuth Popup Communication

The application uses a dual-channel approach for communication between the OAuth popup and the main window:

### Primary Channel: PostMessage API
```typescript
// lib/utils/createPopupResponse.ts
try {
  if (window.opener && window.opener.postMessage) {
    window.opener.postMessage(responseData, baseUrl);
    console.log("Message posted to parent window");
  }
} catch (e) {
  console.error('Failed to post message to parent:', e);
}
```

### Fallback Channel: LocalStorage (COOP-Safe)
```typescript
// lib/utils/createPopupResponse.ts
try {
  localStorage.setItem(storageKey, JSON.stringify(responseData));
  console.log('Response stored in localStorage with key:', storageKey);
} catch (e) {
  console.error('Failed to store in localStorage:', e);
}
```

### Main Window Listener
```typescript
// stores/integrationStore.ts
// Check localStorage for OAuth responses (COOP-safe)
const storageCheckTimer = setInterval(() => {
  try {
    // Check localStorage for any keys that match our prefix
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(storageCheckPrefix)) {
        const storedData = localStorage.getItem(key);
        if (storedData) {
          const responseData = JSON.parse(storedData);
          // Process the response...
          localStorage.removeItem(key); // Clean up
        }
      }
    }
  } catch (error) {
    console.error(`Error checking localStorage:`, error);
  }
}, 500);
```

## 3. Callback Handling

### OAuth Callback Processing
```typescript
// app/api/integrations/google-calendar/callback/route.ts
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  
  // Validate state parameter
  let stateData = JSON.parse(atob(state))
  const { userId } = stateData
  
  // Exchange code for tokens
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${baseUrl}/api/integrations/google-calendar/callback`,
      grant_type: "authorization_code",
    }),
  })
  
  // Process token response and store in database
  // ...
  
  // Return response to popup
  return createPopupResponse("success", "google-calendar", "Successfully connected Google Calendar", baseUrl)
}
```

## 4. Token Management

### Token Encryption
```typescript
// lib/security/encryption.ts
export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(encryptionKey), iv)
  
  let encrypted = cipher.update(token, "utf8", "hex")
  encrypted += cipher.final("hex")
  
  return `${iv.toString("hex")}:${encrypted}`
}
```

### Token Refresh
```typescript
// lib/integrations/tokenUtils.ts
export async function refreshAccessToken(integration: Integration): Promise<TokenRefreshResult> {
  const { provider, refresh_token } = integration
  const providerConfig = OAUTH_PROVIDERS[provider]
  
  // Decrypt refresh token
  const decryptedRefreshToken = decryptToken(refresh_token!)
  
  // Build token refresh request
  const params = new URLSearchParams({
    refresh_token: decryptedRefreshToken,
    grant_type: "refresh_token",
    client_id: process.env[providerConfig.clientIdEnv]!,
  })
  
  if (providerConfig.refreshRequiresClientAuth) {
    params.append("client_secret", process.env[providerConfig.clientSecretEnv]!)
  }
  
  // Send refresh request
  const response = await fetch(providerConfig.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })
  
  // Process and store new tokens
  // ...
}
```

## Security Considerations

### CSRF Protection
- State parameter used in all OAuth flows
- State stored in database or sessionStorage
- Verified during callback processing

### Token Security
- Tokens encrypted using AES-256-CBC
- Refresh tokens never exposed to client
- Access tokens have short expiry

### COOP Policy Compatibility
- Dual-channel communication (postMessage + localStorage)
- Graceful fallbacks for strict browser security policies
- Proper error handling for security restrictions

## Browser Compatibility

The OAuth flow is designed to work with modern browsers and their security policies:

- **Chrome/Edge**: Full support with both postMessage and localStorage
- **Firefox**: Full support with both channels
- **Safari**: Full support with localStorage fallback
- **Mobile browsers**: Compatible with localStorage approach

## Troubleshooting

Common issues and solutions:

1. **COOP Policy Errors**: Fixed by using localStorage for communication
2. **Undefined Client ID**: Check environment variables and ensure server-side generation
3. **State Parameter Mismatch**: Usually caused by stale state in database
4. **Redirect URI Mismatch**: Ensure redirect URIs match exactly in Google Console

## Best Practices

- Use server-side OAuth URL generation for security
- Implement multiple communication channels between popup and main window
- Store state in database for verification
- Encrypt all sensitive tokens
- Implement proper error handling and user feedback