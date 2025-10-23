# CORS Security Guide

**Quick reference for implementing secure CORS in ChainReact**

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Overview

ChainReact uses a centralized CORS utility to enforce secure cross-origin request handling. This prevents unauthorized websites from making requests to our API.

### Key Principles

1. **Whitelist-based**: Only explicitly allowed origins can make requests
2. **No wildcards in production**: Never use `Access-Control-Allow-Origin: *`
3. **Credentials control**: Only allow credentials from trusted origins
4. **Security headers**: Always include additional security headers

## Quick Start

### Basic API Route with CORS

```typescript
import { NextRequest } from 'next/server'
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'

// Handle preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
}

// Handle actual request
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true })
  return addCorsHeaders(response, request, { allowCredentials: true })
}
```

### Public Endpoint (No Auth)

```typescript
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: false,  // Public endpoint
    allowedMethods: ['GET', 'OPTIONS'],
  })
}
```

## API Reference

### `isOriginAllowed(origin: string | null): boolean`

Checks if an origin is in the allowed list.

```typescript
import { isOriginAllowed } from '@/lib/utils/cors'

if (isOriginAllowed('https://www.chainreact.app')) {
  // Origin is trusted
}
```

### `getCorsHeaders(request, options): Record<string, string>`

Returns CORS headers for the given request.

**Parameters:**
- `request: NextRequest` - The incoming request
- `options`:
  - `allowCredentials?: boolean` - Allow cookies/auth (default: false)
  - `allowedMethods?: string[]` - HTTP methods (default: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
  - `allowedHeaders?: string[]` - Request headers (default: ['Content-Type', 'Authorization', ...])
  - `maxAge?: number` - Preflight cache duration in seconds (default: 3600)

**Returns:** Object with CORS and security headers

```typescript
import { getCorsHeaders } from '@/lib/utils/cors'

const headers = getCorsHeaders(request, {
  allowCredentials: true,
  allowedMethods: ['POST', 'PUT'],
  maxAge: 7200
})
```

### `handleCorsPreFlight(request, options): NextResponse`

Handles OPTIONS preflight requests.

**Parameters:** Same as `getCorsHeaders`

**Returns:** NextResponse with 204 status and CORS headers

```typescript
import { handleCorsPreFlight } from '@/lib/utils/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS']
  })
}
```

### `corsJsonResponse(data, request, options): NextResponse`

Creates a JSON response with CORS headers.

**Parameters:**
- `data: any` - Response data
- `request: NextRequest` - The incoming request
- `options`:
  - `status?: number` - HTTP status (default: 200)
  - All CORS options from `getCorsHeaders`

```typescript
import { corsJsonResponse } from '@/lib/utils/cors'

export async function POST(request: NextRequest) {
  return corsJsonResponse(
    { message: 'Success' },
    request,
    { status: 200, allowCredentials: true }
  )
}
```

### `addCorsHeaders(response, request, options): NextResponse`

Adds CORS headers to an existing response.

```typescript
import { addCorsHeaders } from '@/lib/utils/cors'

export async function POST(request: NextRequest) {
  const data = await processRequest(request)
  const response = NextResponse.json(data)
  return addCorsHeaders(response, request, { allowCredentials: true })
}
```

## Common Patterns

### Pattern 1: Authenticated API Endpoint

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return addCorsHeaders(response, request, { allowCredentials: true })
  }

  // Process request
  const data = await processRequest(request, user)
  const response = NextResponse.json(data)
  return addCorsHeaders(response, request, { allowCredentials: true })
}
```

### Pattern 2: Webhook Endpoint (No CORS needed)

Webhooks come from external services, not browsers, so they don't need CORS:

```typescript
// NO CORS needed for webhooks
export async function POST(request: NextRequest) {
  // Verify webhook signature
  const isValid = await verifyWebhookSignature(request)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Process webhook
  await processWebhook(request)
  return NextResponse.json({ success: true })
}
```

### Pattern 3: Public Read-Only API

```typescript
import { handleCorsPreFlight, corsJsonResponse } from '@/lib/utils/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: false,  // Public endpoint
    allowedMethods: ['GET', 'OPTIONS'],
  })
}

export async function GET(request: NextRequest) {
  const data = await fetchPublicData()
  return corsJsonResponse(data, request, {
    allowCredentials: false,
  })
}
```

### Pattern 4: Admin-Only Endpoint

```typescript
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return addCorsHeaders(response, request, { allowCredentials: true })
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return addCorsHeaders(response, request, { allowCredentials: true })
  }

  // Process admin request
  const data = await processAdminRequest(request)
  const response = NextResponse.json(data)
  return addCorsHeaders(response, request, { allowCredentials: true })
}
```

## Troubleshooting

### CORS Error: "No 'Access-Control-Allow-Origin' header"

**Problem:** Browser blocks the request because the origin isn't allowed.

**Solutions:**

1. **Check if origin is whitelisted:**
   ```typescript
   // In /lib/utils/cors.ts
   const ALLOWED_ORIGINS = [
     'https://www.chainreact.app',
     'https://chainreact.app',
     // Is your origin here?
   ]
   ```

2. **For development, set NGROK_URL:**
   ```bash
   export NGROK_URL="https://abc123.ngrok-free.app"
   ```

3. **Check that you're using the CORS utility:**
   ```typescript
   // ❌ Wrong
   export async function OPTIONS(request: NextRequest) {
     return new NextResponse(null, { status: 200 })
   }

   // ✅ Correct
   export async function OPTIONS(request: NextRequest) {
     return handleCorsPreFlight(request, { allowCredentials: true })
   }
   ```

### CORS Error: "Credentials flag is 'true', but 'Access-Control-Allow-Credentials' is not"

**Problem:** Browser is sending credentials but server isn't allowing them.

**Solution:**
```typescript
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,  // Add this!
  })
}
```

### CORS Works in Postman but Not in Browser

**Explanation:** Postman doesn't enforce CORS, browsers do. This is expected.

**Solution:** Fix the CORS configuration for browser requests using this guide.

### Request Blocked Even Though Origin Is Allowed

**Debugging Steps:**

1. **Check the exact origin:**
   ```javascript
   // In browser console
   console.log(window.location.origin)
   // vs
   // In ALLOWED_ORIGINS
   'https://www.chainreact.app'  // Must match exactly
   ```

2. **Check for typos:**
   - `https://chainreact.app` ≠ `https://www.chainreact.app`
   - Trailing slashes don't matter in origins

3. **Check request headers:**
   ```bash
   # In browser DevTools > Network > Headers
   # Look for:
   Origin: https://www.chainreact.app
   ```

4. **Verify preflight is handled:**
   ```typescript
   // Must have OPTIONS handler
   export async function OPTIONS(request: NextRequest) {
     return handleCorsPreFlight(request)
   }
   ```

### Development: "Access-Control-Allow-Origin" Can't Be Wildcard

**Problem:** Trying to use `*` with credentials.

**Solution:**
```typescript
// ❌ Wrong - can't use wildcard with credentials
'Access-Control-Allow-Origin': '*'
'Access-Control-Allow-Credentials': 'true'

// ✅ Correct - use specific origin
'Access-Control-Allow-Origin': 'https://www.chainreact.app'
'Access-Control-Allow-Credentials': 'true'
```

## Configuration

### Adding a New Allowed Origin

1. Edit [/lib/utils/cors.ts](../../lib/utils/cors.ts)
2. Add to `ALLOWED_ORIGINS`:
   ```typescript
   const ALLOWED_ORIGINS = [
     'https://www.chainreact.app',
     'https://chainreact.app',
     'https://new-domain.com',  // Add here
   ]
   ```
3. **IMPORTANT:** Only add domains you control and trust
4. Always use HTTPS in production
5. Test thoroughly after adding

### Temporary Development Origins

Use environment variables instead of hardcoding:

```bash
# .env.local
NGROK_URL=https://abc123.ngrok-free.app
```

The CORS utility automatically includes this in development mode.

## Security Checklist

When implementing CORS:

- [ ] Never use `Access-Control-Allow-Origin: *` with credentials
- [ ] Only whitelist domains you control
- [ ] Always validate origins against the whitelist
- [ ] Use `allowCredentials: true` only when necessary
- [ ] Include OPTIONS handler for preflight requests
- [ ] Test with real browser (not just Postman)
- [ ] Verify security headers are present
- [ ] Document why each origin is allowed

## Additional Resources

- [Detailed Security Fix Walkthrough](../walkthroughs/cors-security-fix.md)
- [MDN CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [OWASP CORS Security](https://cheatsheetseries.owasp.org/cheatsheets/CORS_Security_Cheat_Sheet.html)
