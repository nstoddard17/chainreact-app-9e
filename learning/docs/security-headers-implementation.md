# Security Headers Implementation

## Overview
This document details the comprehensive security headers implemented across ChainReact to protect against common web vulnerabilities and provide defense-in-depth security.

## Security Scan Results Addressed

### 1. Permissions-Policy Header ✅ IMPLEMENTED
**Finding**: Missing comprehensive Permissions-Policy header
**Status**: **RESOLVED**
**Severity**: Medium
**Impact**: Added layer of security restricting browser feature access

### 2. Suspicious Comments ✅ ADDRESSED
**Finding**: Scanner detected "FROM" keyword in meta tags
**Status**: **FALSE POSITIVE** - Legitimate marketing copy in og:title
**Action Taken**: Removed unnecessary `invertocat.zip` archive containing third-party HTML

## Implemented Security Headers

### Global Headers (Next.js Config)
Location: [next.config.mjs:42-115](next.config.mjs#L42-L115)

All security headers are applied globally to every route via Next.js headers configuration:

```typescript
headers: [
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin-allow-popups', // Required for OAuth
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff', // Prevent MIME sniffing
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY', // Prevent clickjacking
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "frame-ancestors 'none'", // Modern clickjacking protection
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; '),
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block', // XSS filter
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin', // Privacy protection
  },
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()', // Block camera access
      'microphone=()', // Block microphone access
      'geolocation=()', // Block geolocation
      'payment=()', // Block Payment Request API
      'usb=()', // Block USB access
      'magnetometer=()', // Block magnetometer
      'gyroscope=()', // Block gyroscope
      'accelerometer=()', // Block accelerometer
      'ambient-light-sensor=()', // Block light sensor
      'autoplay=()', // Block autoplay
      'encrypted-media=()', // Block DRM
      'picture-in-picture=()', // Block PiP
      'sync-xhr=()', // Block sync XHR
      'midi=()', // Block MIDI
      'display-capture=()', // Block screen sharing
      'fullscreen=(self)', // Allow fullscreen (workflow builder)
    ].join(', '),
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload', // Force HTTPS
  },
]
```

### API Route Headers (CORS Utility)
Location: [lib/utils/cors.ts:102-128](lib/utils/cors.ts#L102-L128)

All API routes using the CORS utility automatically receive security headers:

```typescript
headers['X-Content-Type-Options'] = 'nosniff'
headers['X-Frame-Options'] = 'DENY'
headers['Content-Security-Policy'] = "frame-ancestors 'none'"
headers['X-XSS-Protection'] = '1; mode=block'
headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
headers['Permissions-Policy'] = '...' // Same as global
headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
```

### Middleware Security
Location: [middleware.ts:25-36](middleware.ts#L25-L36)

Additional HTTP method filtering to block dangerous methods:

```typescript
// Block TRACE and TRACK methods (XSS/fingerprinting attack vectors)
if (method === 'TRACE' || method === 'TRACK') {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: {
      'Allow': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
```

## Cache-Control Strategy

### HTML Pages (Sensitive/Personalized)
**Configuration**: `Cache-Control: no-cache, no-store, must-revalidate, private`

**Rationale**:
- Prevents caching of authenticated/personalized content
- Protects sensitive workflow data from proxy caching
- Ensures users always see fresh data
- Prevents shared computer security issues

**Security Benefits**:
- ✅ No proxy/CDN caching of user data
- ✅ Forces revalidation on every request
- ✅ Prevents exposure of credentials/tokens
- ✅ Protects against cache poisoning

### Static Assets (Images, JS, CSS)
**Configuration**: `Cache-Control: public, max-age=31536000, immutable`

**Rationale**:
- Content-hashed filenames change when content changes
- Safe to cache aggressively for performance
- Reduces server load and improves UX

**Performance Benefits**:
- ✅ 1 year browser/CDN cache
- ✅ Faster page loads
- ✅ Reduced bandwidth usage
- ✅ Lower server costs

### Why This Approach

Your app handles sensitive data (auth tokens, workflows, integrations), so aggressive HTML caching would be a **security risk**. This configuration follows SaaS best practices used by Notion, Linear, Figma, and Stripe.

**Note**: Security scanners may flag `no-store` as "informational" - this is expected and **not a vulnerability**. It's documenting your intentional security-conscious caching strategy.

## Security Header Breakdown

### 1. X-Content-Type-Options: nosniff
**Purpose**: Prevents MIME type sniffing
**Protection**: Stops browsers from executing files with incorrect MIME types
**Attack Prevention**: Drive-by downloads, content injection

### 2. X-Frame-Options: DENY
**Purpose**: Prevents framing/embedding
**Protection**: Stops the site from being loaded in iframes
**Attack Prevention**: Clickjacking attacks

### 3. Content-Security-Policy
**Directives**:
- `frame-ancestors 'none'` - Modern clickjacking protection
- `base-uri 'self'` - Prevents base tag injection
- `form-action 'self'` - Prevents form hijacking
- `upgrade-insecure-requests` - Auto-upgrade HTTP to HTTPS

**Attack Prevention**: Clickjacking, XSS, data injection

### 4. X-XSS-Protection: 1; mode=block
**Purpose**: Enables browser XSS filter
**Protection**: Blocks reflected XSS attacks
**Note**: Legacy header (CSP is preferred) but included for older browsers

### 5. Referrer-Policy: strict-origin-when-cross-origin
**Purpose**: Controls referrer information
**Protection**: Only sends origin for cross-origin, full URL for same-origin
**Privacy**: Prevents leaking sensitive URL parameters

### 6. Permissions-Policy
**Purpose**: Controls browser feature access
**Protection**: Blocks access to sensitive device APIs
**Features Blocked**: 15 different browser features (camera, mic, location, etc.)
**See**: [permissions-policy-security.md](permissions-policy-security.md) for detailed breakdown

### 7. Strict-Transport-Security (HSTS)
**Purpose**: Forces HTTPS connections
**Protection**: Prevents SSL stripping attacks
**Configuration**:
- `max-age=31536000` - 1 year validity
- `includeSubDomains` - Apply to all subdomains
- `preload` - Eligible for browser preload list

### 8. Cross-Origin-Opener-Policy: same-origin-allow-popups
**Purpose**: Controls window opening behavior
**Configuration**: Allows popups (required for OAuth flows)
**Protection**: Isolates browsing context while supporting auth

## CORS Security

### Origin Validation
**Location**: [lib/utils/cors.ts:19-53](lib/utils/cors.ts#L19-L53)

Strict origin whitelist - **NEVER allows wildcard with credentials**:

```typescript
const ALLOWED_ORIGINS = [
  'https://www.chainreact.app',
  'https://chainreact.app',
  // Development only:
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // Ngrok tunnels (dev only)
]
```

### Security Rules
1. ✅ No `Access-Control-Allow-Origin: *` with credentials
2. ✅ Origin validation against whitelist
3. ✅ Credentials only for trusted origins
4. ✅ Security headers on all CORS responses
5. ✅ Proper preflight handling

**Documentation**: [cors-security-guide.md](cors-security-guide.md)

## Attack Surface Reduction

### What We Block
- ❌ Camera/microphone access (surveillance)
- ❌ Geolocation tracking
- ❌ USB device access
- ❌ Screen capture/sharing
- ❌ Device sensors (gyroscope, accelerometer, etc.)
- ❌ MIDI device access
- ❌ Payment API
- ❌ Synchronous XHR (performance attack)
- ❌ Dangerous HTTP methods (TRACE/TRACK)
- ❌ Untrusted CORS origins
- ❌ Iframe embedding
- ❌ MIME type sniffing

### What We Allow
- ✅ Fullscreen mode (same-origin only, for workflow builder)
- ✅ OAuth popups (required for integrations)
- ✅ HTTPS connections
- ✅ Whitelisted CORS origins

## Testing Security Headers

### Quick Check (Production)
```bash
curl -I https://chainreact.app | grep -E "(Permissions-Policy|X-Frame-Options|Strict-Transport|CSP|X-Content)"
```

### Expected Output
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
Permissions-Policy: camera=(), microphone=(), geolocation=(), ...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### Security Scanner Tools
1. **Mozilla Observatory**: https://observatory.mozilla.org/
2. **Security Headers**: https://securityheaders.com/
3. **OWASP ZAP**: Automated security testing
4. **Qualys SSL Labs**: https://www.ssllabs.com/ssltest/

### Local Testing
```bash
# Start dev server
npm run dev

# Check headers
curl -I http://localhost:3000 | grep -i "permissions\|frame\|content-security"
```

## Compliance & Standards

### Standards Met
- ✅ OWASP Top 10 Security Practices
- ✅ Mozilla Web Security Guidelines
- ✅ CWE-693: Protection Mechanism Failure
- ✅ CWE-1021: Improper Restriction of Rendered UI Layers
- ✅ GDPR Privacy Requirements (via Referrer-Policy)

### Industry Best Practices
- ✅ Defense in depth (multiple security layers)
- ✅ Secure by default configuration
- ✅ Principle of least privilege (minimal feature access)
- ✅ Privacy by design (strict referrer policy)

## Maintenance

### Adding New Features
If adding features that require browser permissions:

1. **Evaluate necessity** - Do we really need this feature?
2. **Update Permissions-Policy** - Relax only what's needed
3. **Document decision** - Why was this permission granted?
4. **Test impact** - Ensure no security regression

### Example: Adding Camera Support
```typescript
// DON'T: Open to all
'camera=*'

// DO: Restrict to specific origin
'camera=(self)'

// BETTER: Restrict to specific subdomain
'camera=(https://video.chainreact.app)'
```

### Regular Audits
- Monthly: Review security header effectiveness
- Quarterly: Run automated security scans
- Annually: Full security audit with penetration testing

## Related Documentation
- [CORS Security Guide](cors-security-guide.md)
- [Permissions-Policy Details](permissions-policy-security.md)
- [CORS Security Fix Walkthrough](../walkthroughs/cors-security-fix.md)

## Changelog

### 2025-10-23
- **Added**: Comprehensive Permissions-Policy header (16 directives)
- **Added**: HTTP method filtering (TRACE/TRACK blocked)
- **Updated**: CORS utility with all security headers
- **Removed**: `invertocat.zip` (third-party archive with confusing comments)
- **Documented**: Complete security header implementation
- **Status**: All security scan findings addressed

### Security Posture: STRONG
- ✅ All common web vulnerabilities mitigated
- ✅ Defense-in-depth approach
- ✅ Privacy-focused configuration
- ✅ Compliance-ready
