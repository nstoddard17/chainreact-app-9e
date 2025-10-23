# Cache Control Security Fix

**Date**: 2025-10-23
**Issue**: Inadequate cache control headers for sensitive content
**Severity**: MEDIUM-HIGH
**Impact**: Potential exposure of personalized/sensitive data through shared caches

## Vulnerability Summary

### The Problem

The application had inadequate cache control headers that could allow sensitive, personalized, or user-specific information to be cached by:

1. **Proxy Servers**: Corporate or educational network proxies
2. **CDN Edge Caches**: Vercel's edge network (indicated by `Age: 0` header)
3. **Browser Caches**: User's local browser cache
4. **ISP Caches**: Internet service provider caching servers

### Security Risks

**High Impact Scenarios:**
- **Session Hijacking**: One user accessing another user's cached session data
- **Data Leakage**: Personal information exposed through shared proxy caches
- **Privacy Violation**: Sensitive workflow data visible to other users on same network
- **Authentication Bypass**: Cached authenticated pages accessible without login

**Real-World Attack Scenarios:**

1. **Corporate Network Attack**:
   ```
   User A logs in → Views workflows → Proxy caches response
   User B on same network → Gets User A's cached workflows
   ```

2. **Public WiFi Attack**:
   ```
   User logs in at coffee shop → Proxy cache stores response
   Next user on same WiFi → Sees previous user's data
   ```

3. **CDN Edge Cache Leak**:
   ```
   User A in US East → Views personalized dashboard → CDN caches
   User B in US East → Gets User A's cached dashboard
   ```

## The Fix

### 1. Enhanced HTML Page Cache Control

**File**: [next.config.mjs](../../next.config.mjs)

**Before**:
```javascript
{
  key: 'Cache-Control',
  value: isDev
    ? 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    : 'no-store, must-revalidate',  // ❌ Missing 'private' and 'no-cache'
}
```

**After**:
```javascript
{
  key: 'Cache-Control',
  value: isDev
    ? 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    : 'no-cache, no-store, must-revalidate, private',  // ✅ Complete protection
},
{
  key: 'Pragma',
  value: 'no-cache',  // ✅ HTTP/1.0 compatibility
},
{
  key: 'Expires',
  value: '0',  // ✅ Legacy browser support
}
```

**What Changed:**
- Added `private` directive - Prevents shared cache storage (proxies/CDNs)
- Added `no-cache` directive - Requires revalidation before using cached copy
- Added `Pragma: no-cache` - HTTP/1.0 proxy compatibility
- Added `Expires: 0` - Legacy browser cache prevention

### 2. API Response Cache Control

**File**: [lib/utils/cors.ts](../../lib/utils/cors.ts)

**Added to all API responses**:
```typescript
// Prevent caching of API responses (sensitive/user-specific data)
headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, private'
headers['Pragma'] = 'no-cache'
headers['Expires'] = '0'
```

**What This Protects:**
- User-specific API data (workflows, integrations, executions)
- Authentication tokens and session data
- Personalized dashboard metrics
- Real-time workflow execution data

### 3. Static Asset Caching (Unchanged - Secure)

**Static assets SHOULD be cached** (they're not user-specific):

```javascript
// Images, JS, CSS - Cache aggressively
{
  source: '/_next/static/(.*)',
  headers: [
    {
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',  // ✅ 1 year cache
    }
  ]
}
```

**Why this is safe:**
- Static files have content hashes in filenames (e.g., `app-abc123.js`)
- Changing content = new filename = new cache entry
- No user-specific data in static assets
- Improves performance significantly

## Understanding Cache Control Directives

### Complete Header Breakdown

```
Cache-Control: no-cache, no-store, must-revalidate, private
Pragma: no-cache
Expires: 0
```

**Directive by Directive:**

| Directive | Purpose | Protects Against |
|---|---|---|
| `no-cache` | Browser must revalidate with server before using cached copy | Stale data from browser cache |
| `no-store` | Don't store ANY copy in ANY cache | Disk caching, shared caches |
| `must-revalidate` | Cache MUST check with server if content is stale | Proxy serving stale content |
| `private` | Only browser cache allowed, NOT shared caches | Proxy/CDN caching user data |
| `Pragma: no-cache` | HTTP/1.0 version of Cache-Control | Legacy proxy servers |
| `Expires: 0` | Content expired in the past | Legacy browsers |

### HTTP/1.0 vs HTTP/1.1 Compatibility

```
HTTP/1.1 Caches:
  Read: Cache-Control header
  Understand: no-cache, no-store, must-revalidate, private

HTTP/1.0 Caches:
  Read: Pragma and Expires headers
  Understand: no-cache

Solution: Include both for maximum compatibility
```

## How It Works

### Request Flow with Cache Control

#### Before Fix (Vulnerable):

```
┌─────────────┐
│   User A    │
│ GET /dash   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Proxy Cache │  Cache-Control: no-store, must-revalidate
│ Missing:    │  ❌ No 'private' directive
│ 'private'   │  Result: Proxy CACHES response
└──────┬──────┘
       │
       ▼ (Cached)

┌─────────────┐
│   User B    │
│ GET /dash   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Proxy Cache │  Returns User A's cached response
│ HIT!        │  ❌ Data leak to User B
└─────────────┘
```

#### After Fix (Secure):

```
┌─────────────┐
│   User A    │
│ GET /dash   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Proxy Cache │  Cache-Control: private, no-store, no-cache
│ Sees:       │  ✅ 'private' directive
│ 'private'   │  Result: DOES NOT cache
└──────┬──────┘
       │
       ▼ (Forwarded to server)

┌─────────────┐
│   Server    │  Returns User A's data
│ Fresh resp  │  Not cached anywhere
└─────────────┘

┌─────────────┐
│   User B    │
│ GET /dash   │  Always gets fresh request to server
└─────────────┘  Never sees User A's data
```

## Testing

### Test 1: Verify Cache-Control Headers

```bash
curl -I https://chainreact.app
```

**Expected Headers:**
```
HTTP/2 200
cache-control: no-cache, no-store, must-revalidate, private
pragma: no-cache
expires: 0
x-content-type-options: nosniff
x-frame-options: DENY
content-security-policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

### Test 2: Verify API Response Headers

```bash
curl -I https://chainreact.app/api/workflows
```

**Expected:**
```
cache-control: no-cache, no-store, must-revalidate, private
pragma: no-cache
expires: 0
```

### Test 3: Verify Static Assets ARE Cached

```bash
curl -I https://chainreact.app/_next/static/chunks/app-abc123.js
```

**Expected:**
```
cache-control: public, max-age=31536000, immutable
```

### Test 4: Browser DevTools Verification

1. Open Chrome DevTools → Network tab
2. Navigate to dashboard
3. Check Response Headers for HTML document
4. Should see:
   ```
   Cache-Control: no-cache, no-store, must-revalidate, private
   Pragma: no-cache
   Expires: 0
   ```

### Test 5: Proxy Cache Behavior

Using a proxy cache (if available):

```bash
# First request (cache miss)
curl -I -x http://proxy.example.com:8080 https://chainreact.app

# Second request (should NOT be cached due to 'private')
curl -I -x http://proxy.example.com:8080 https://chainreact.app
```

**Expected**: Both requests should go to origin server (no cache hit)

## Security Impact

### Before Fix

- ❌ Missing `private` directive allowed proxy caching
- ❌ Missing `no-cache` allowed stale content
- ❌ Missing `Pragma` meant HTTP/1.0 proxies could cache
- ❌ Missing `Expires` meant legacy browsers could cache
- ⚠️  API responses had no cache control at all

**Risk Level**: HIGH for multi-user networks (corporate, educational, public WiFi)

### After Fix

- ✅ `private` prevents ALL shared cache storage
- ✅ `no-cache` requires revalidation
- ✅ `no-store` prevents any disk caching
- ✅ `must-revalidate` forces cache freshness checks
- ✅ `Pragma: no-cache` covers HTTP/1.0 proxies
- ✅ `Expires: 0` covers legacy browsers
- ✅ API responses include full cache prevention

**Risk Level**: LOW - Defense in depth against cache-based attacks

### Attack Surface Reduction

| Attack Vector | Before | After | Impact |
|---|---|---|---|
| Proxy cache leak | ❌ Vulnerable | ✅ Protected | **CRITICAL** |
| CDN edge cache leak | ⚠️  Possible | ✅ Prevented | **HIGH** |
| Browser cache exposure | ⚠️  Cached | ✅ No-store | **MEDIUM** |
| Legacy proxy caching | ❌ Vulnerable | ✅ Protected | **MEDIUM** |
| API response caching | ❌ No headers | ✅ Full protection | **HIGH** |

## Best Practices

### ✅ DO

1. **Always use `private` for user-specific content**
   ```javascript
   'Cache-Control': 'private, no-cache, no-store, must-revalidate'
   ```

2. **Include HTTP/1.0 compatibility headers**
   ```javascript
   'Pragma': 'no-cache'
   'Expires': '0'
   ```

3. **Cache static assets aggressively**
   ```javascript
   // For /static/, /_next/static/
   'Cache-Control': 'public, max-age=31536000, immutable'
   ```

4. **Differentiate between public and private content**
   - Public marketing pages: `public, max-age=3600`
   - Authenticated pages: `private, no-cache, no-store`

5. **Use content hashing for static files**
   - Next.js does this automatically
   - Enables aggressive caching without stale content risk

### ❌ DON'T

1. **Don't use `public` for user-specific data**
   ```javascript
   // ❌ WRONG for user dashboard
   'Cache-Control': 'public, max-age=300'
   ```

2. **Don't rely on `max-age=0` alone**
   ```javascript
   // ❌ Incomplete - shared caches can still store
   'Cache-Control': 'max-age=0'

   // ✅ Correct
   'Cache-Control': 'private, no-cache, no-store'
   ```

3. **Don't forget legacy proxy support**
   ```javascript
   // ❌ HTTP/1.0 proxies will cache
   'Cache-Control': 'no-cache'

   // ✅ Includes HTTP/1.0 support
   'Cache-Control': 'no-cache'
   'Pragma': 'no-cache'
   ```

4. **Don't cache API responses with user data**
   ```javascript
   // ❌ Never do this for /api/user, /api/workflows
   'Cache-Control': 'public, max-age=60'
   ```

5. **Don't disable caching for static assets**
   ```javascript
   // ❌ Bad performance - static JS/CSS should be cached
   'Cache-Control': 'no-cache'  // For /static/app.js

   // ✅ Static assets with content hash
   'Cache-Control': 'public, max-age=31536000, immutable'
   ```

## Platform-Specific Considerations

### Vercel CDN

**Behavior:**
- Respects `Cache-Control: private` - Won't cache at edge
- Respects `no-store` - Won't cache anywhere
- Adds `Age` header to show cache hits
- `Age: 0` means fresh from origin

**Optimal Configuration:**
```javascript
// For HTML pages (user-specific)
'Cache-Control': 'private, no-cache, no-store, must-revalidate'

// For static assets (content-hashed)
'Cache-Control': 'public, max-age=31536000, immutable'

// For API routes (sensitive data)
'Cache-Control': 'private, no-cache, no-store, must-revalidate'
```

### Corporate Proxies

**Common Issues:**
- Some proxies ignore `Cache-Control` for "performance"
- HTTP/1.0 proxies only read `Pragma`
- Solution: Include ALL headers for maximum compatibility

**Defense in Depth:**
```javascript
headers: {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}
```

## Monitoring & Verification

### Production Verification Checklist

After deploying:

- [ ] Test HTML page headers with `curl -I`
- [ ] Verify API response headers
- [ ] Check static asset caching still works
- [ ] Test with browser DevTools Network tab
- [ ] Confirm `Age: 0` or header absent (no CDN cache)
- [ ] Test from different geographic regions
- [ ] Test with and without authentication

### Monitoring Recommendations

1. **Log Cache Headers**: Monitor `Cache-Control` in responses
2. **Track Age Header**: Alert if `Age > 0` for user content
3. **CDN Analytics**: Monitor cache hit rates (should be 0% for HTML)
4. **Security Scanning**: Regular header audits

## References

- [RFC 7234: HTTP Caching](https://datatracker.ietf.org/doc/html/rfc7234)
- [RFC 9110: HTTP Semantics (Cache Control)](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.2)
- [MDN: Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
- [OWASP: Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#web-content-caching)

## Related Files

- **Next.js Config**: [next.config.mjs](../../next.config.mjs)
- **CORS Utility**: [lib/utils/cors.ts](../../lib/utils/cors.ts)
- **Other Security Fixes**:
  - [CORS Security](./cors-security-fix.md)
  - [Server Fingerprinting](./server-fingerprinting-mitigation.md)

## Summary

This fix ensures that:

1. ✅ **User-specific content** is NEVER cached by shared caches (proxies, CDNs)
2. ✅ **API responses** with sensitive data are not cached
3. ✅ **HTTP/1.0 and HTTP/1.1** proxies both respect cache directives
4. ✅ **Static assets** remain cached for performance
5. ✅ **Defense in depth** with multiple complementary headers

The application is now protected against cache-based data leakage while maintaining optimal performance for static assets.

**Risk Eliminated**: Session hijacking and data leakage through shared caches is now prevented.
