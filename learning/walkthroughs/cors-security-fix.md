# CORS Security Vulnerability Fix

**Date**: 2025-10-23
**Severity**: HIGH
**Issue**: CORS misconfiguration allowing unauthorized cross-origin requests

## Vulnerability Summary

### The Problem

The application had a critical CORS misconfiguration that could allow attackers to:
1. Perform AJAX queries from malicious websites to ChainReact API endpoints
2. Access unauthenticated sensitive content
3. Potentially perform authenticated requests if credentials were leaked
4. Execute CSRF-like attacks from compromised or malicious websites

### Specific Issues Found

1. **Wildcard CORS Headers** (`Access-Control-Allow-Origin: *`)
   - Found in: `/app/api/workflows/ai/resolve-fields/route.ts`
   - Found in: `/app/api/workflows/ai/search-actions/route.ts`
   - **Risk**: Any website could make requests to these endpoints

2. **Missing Origin Validation**
   - No whitelist of allowed origins
   - No runtime validation of request origins
   - All origins were implicitly trusted

3. **Inadequate Security Headers**
   - Missing: `X-Frame-Options`
   - Missing: `Content-Security-Policy` with `frame-ancestors`
   - Missing: `X-XSS-Protection`
   - Missing: `Referrer-Policy`
   - Missing: `Permissions-Policy`
   - Missing: `Strict-Transport-Security`

## The Fix

### 1. Created Secure CORS Utility (`/lib/utils/cors.ts`)

Created a centralized CORS utility that:

#### Origin Whitelisting
```typescript
const ALLOWED_ORIGINS = [
  'https://www.chainreact.app',
  'https://chainreact.app',
  // Development origins only in dev mode
  ...(process.env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : []
  )
]
```

#### Key Features

1. **Explicit Origin Validation**
   - Only trusted domains can make cross-origin requests
   - Separate configuration for development and production
   - Ngrok support for development (with pattern matching)

2. **Secure Headers Helper**
   ```typescript
   getCorsHeaders(request, {
     allowCredentials: true,
     allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
     allowedHeaders: ['Content-Type', 'Authorization'],
     maxAge: 3600
   })
   ```

3. **Preflight Request Handler**
   ```typescript
   handleCorsPreFlight(request, options)
   ```

4. **Additional Security Headers**
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Content-Security-Policy: frame-ancestors 'none'`
   - `X-XSS-Protection: 1; mode=block`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

### 2. Updated API Routes

**Before:**
```typescript
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',  // ❌ INSECURE
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
```

**After:**
```typescript
import { handleCorsPreFlight } from '@/lib/utils/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
}
```

**Updated Files:**
- `/app/api/workflows/ai/resolve-fields/route.ts`
- `/app/api/workflows/ai/search-actions/route.ts`

### 3. Enhanced Next.js Security Headers

Added comprehensive security headers to [next.config.mjs](../../next.config.mjs):

```javascript
{
  key: 'X-Frame-Options',
  value: 'DENY',
},
{
  key: 'Content-Security-Policy',
  value: [
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; '),
},
{
  key: 'X-XSS-Protection',
  value: '1; mode=block',
},
{
  key: 'Referrer-Policy',
  value: 'strict-origin-when-cross-origin',
},
{
  key: 'Permissions-Policy',
  value: 'camera=(), microphone=(), geolocation=()',
},
{
  key: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains; preload',
}
```

**Clickjacking Protection (Defense in Depth):**
- `X-Frame-Options: DENY` - Legacy browser support
- `Content-Security-Policy: frame-ancestors 'none'` - Modern standard
- Both headers provide redundant protection against clickjacking attacks

## How It Works

### Request Flow

1. **Browser sends preflight OPTIONS request**
   - Includes `Origin` header with requesting domain

2. **Server validates origin**
   ```typescript
   if (isOriginAllowed(origin)) {
     // Allow request, set CORS headers
   } else {
     // Reject, no CORS headers set
   }
   ```

3. **If origin is allowed:**
   - Sets `Access-Control-Allow-Origin: <specific-origin>`
   - Sets `Access-Control-Allow-Credentials: true`
   - Sets allowed methods and headers

4. **If origin is NOT allowed:**
   - No CORS headers are set
   - Browser blocks the cross-origin request

### Security Layers

1. **Origin Validation**: Only whitelisted domains accepted
2. **Credentials Control**: Only set when explicitly needed and origin is trusted
3. **Method Restriction**: Only specified HTTP methods allowed
4. **Header Restriction**: Only specified headers allowed
5. **Additional Security**: XSS, clickjacking, and MIME-sniffing protection

## Usage Guide

### For New API Routes

When creating a new API route that needs CORS:

```typescript
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'

// Handle OPTIONS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
  })
}

// Handle actual request with CORS
export async function POST(request: NextRequest) {
  // Your logic here...
  const response = NextResponse.json(data)

  // Add CORS headers to response
  return addCorsHeaders(response, request, {
    allowCredentials: true
  })
}
```

### For Public API Endpoints

If you have a truly public endpoint (no auth required):

```typescript
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: false,  // No credentials for public endpoints
    allowedMethods: ['GET', 'OPTIONS'],
  })
}
```

### Adding New Allowed Origins

To add a new trusted domain:

1. Edit `/lib/utils/cors.ts`
2. Add to `ALLOWED_ORIGINS` array:
   ```typescript
   const ALLOWED_ORIGINS = [
     'https://www.chainreact.app',
     'https://chainreact.app',
     'https://new-trusted-domain.com',  // Add here
   ]
   ```

### Development with Ngrok/Tunnels

Set environment variable:
```bash
export NGROK_URL="https://abc123.ngrok-free.app"
```

The CORS utility will automatically allow this origin in development mode.

## Testing

### Test 1: Verify Allowed Origin Works

```bash
curl -X OPTIONS https://www.chainreact.app/api/workflows/ai/resolve-fields \
  -H "Origin: https://www.chainreact.app" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

Expected: Should return CORS headers with `Access-Control-Allow-Origin: https://www.chainreact.app`

### Test 2: Verify Blocked Origin Fails

```bash
curl -X OPTIONS https://www.chainreact.app/api/workflows/ai/resolve-fields \
  -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

Expected: Should NOT return `Access-Control-Allow-Origin` header

### Test 3: Verify Security Headers Present

```bash
curl -I https://www.chainreact.app
```

Expected: Should include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

## Prevention & Best Practices

### ✅ DO

1. **Always use the CORS utility** for new API routes
2. **Validate origins** against a whitelist
3. **Only set `Access-Control-Allow-Credentials: true`** when absolutely necessary
4. **Use HTTPS** for all production origins
5. **Test CORS configuration** before deploying
6. **Keep the allowed origins list minimal** - only add domains you control

### ❌ DON'T

1. **Never use `Access-Control-Allow-Origin: *`** with credentials
2. **Never use `Access-Control-Allow-Origin: *`** for authenticated endpoints
3. **Never add untrusted domains** to the allowed origins list
4. **Never disable CORS validation** "just to make it work"
5. **Never commit ngrok URLs** to the allowed origins list

### Code Review Checklist

When reviewing API route PRs:

- [ ] Does the route use `Access-Control-Allow-Origin: *`? ❌ REJECT
- [ ] Does the route validate origins? ✅ REQUIRED
- [ ] Does the route use the CORS utility? ✅ PREFERRED
- [ ] Are security headers included? ✅ REQUIRED
- [ ] Is the route properly authenticated? ✅ REQUIRED

## References

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [PortSwigger: CORS Vulnerabilities](https://portswigger.net/web-security/cors)
- [OWASP: CORS Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/CORS_Security_Cheat_Sheet.html)

## Related Files

- **CORS Utility**: [/lib/utils/cors.ts](../../lib/utils/cors.ts)
- **Next.js Config**: [/next.config.mjs](../../next.config.mjs)
- **Updated Routes**:
  - [/app/api/workflows/ai/resolve-fields/route.ts](../../app/api/workflows/ai/resolve-fields/route.ts)
  - [/app/api/workflows/ai/search-actions/route.ts](../../app/api/workflows/ai/search-actions/route.ts)

## Impact

### Before Fix
- ❌ Any website could make AJAX requests to ChainReact APIs
- ❌ Potential for CSRF-like attacks
- ❌ Unauthenticated data could be stolen
- ❌ Missing clickjacking protection (no X-Frame-Options or CSP frame-ancestors)
- ❌ Missing XSS protection headers
- ❌ No HSTS (HTTP Strict Transport Security)

### After Fix
- ✅ Only whitelisted domains can make cross-origin requests
- ✅ CSRF attacks from untrusted origins blocked
- ✅ Unauthenticated data protected by origin validation
- ✅ Clickjacking prevented by dual protection (X-Frame-Options + CSP frame-ancestors)
- ✅ XSS protection headers in place
- ✅ HSTS enforces HTTPS connections
- ✅ CSP prevents various injection attacks
- ✅ Comprehensive security header suite

## Related Security Fixes

This CORS security fix is part of a comprehensive security hardening effort:

1. **[Cache Control Security](./cache-control-security-fix.md)** - Prevents sensitive data caching
2. **[Server Fingerprinting Mitigation](./server-fingerprinting-mitigation.md)** - Reduces attack surface

Together, these fixes provide defense-in-depth protection for ChainReact.

## Next Steps

1. **Audit all API routes** for CORS headers
2. **Update webhook endpoints** if they need CORS
3. **Monitor logs** for blocked CORS requests (could indicate issues)
4. **Document any new allowed origins** with justification
5. **Regular security audits** of CORS configuration
