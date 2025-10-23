# Permissions-Policy Security Header

## Overview
The Permissions-Policy header is a security feature that controls which browser features and APIs can be used by the web application and any embedded content. This provides defense-in-depth protection against unauthorized access to sensitive device features.

## Implementation

### Location
Implemented in two places for comprehensive coverage:

1. **Next.js Config** ([next.config.mjs:92-110](next.config.mjs#L92-L110)) - Applied to all pages globally
2. **CORS Utility** ([lib/utils/cors.ts:108-126](lib/utils/cors.ts#L108-L126)) - Applied to API routes

### Policy Directives

| Directive | Value | Rationale |
|-----------|-------|-----------|
| `camera` | `()` | Block all camera access - not needed for workflow automation |
| `microphone` | `()` | Block all microphone access - not needed for workflow automation |
| `geolocation` | `()` | Block geolocation - no location-based features |
| `payment` | `()` | Block Payment Request API - no direct payments |
| `usb` | `()` | Block USB device access - security risk |
| `magnetometer` | `()` | Block magnetometer sensor - not needed |
| `gyroscope` | `()` | Block gyroscope sensor - not needed |
| `accelerometer` | `()` | Block accelerometer sensor - not needed |
| `ambient-light-sensor` | `()` | Block light sensor - not needed |
| `autoplay` | `()` | Block media autoplay - no media player |
| `encrypted-media` | `()` | Block DRM content - no protected media |
| `picture-in-picture` | `()` | Block PiP mode - no video content |
| `sync-xhr` | `()` | Block synchronous XHR - bad for performance |
| `midi` | `()` | Block MIDI device access - not needed |
| `display-capture` | `()` | Block screen sharing - privacy concern |
| `fullscreen` | `(self)` | Allow fullscreen for same-origin only (workflow builder) |

## Security Benefits

### 1. Defense in Depth
Even if XSS vulnerabilities exist, attackers cannot:
- Access user's camera/microphone for surveillance
- Track user location via GPS
- Connect to USB devices or MIDI controllers
- Capture screen content
- Trigger payment flows

### 2. Privacy Protection
Prevents malicious scripts or compromised dependencies from:
- Recording audio/video without consent
- Tracking physical location
- Accessing device sensors for fingerprinting

### 3. Compliance
Helps meet security compliance requirements by:
- Limiting browser feature exposure
- Reducing attack surface
- Demonstrating security best practices

### 4. Third-Party Script Protection
Prevents embedded content (ads, widgets, iframes) from:
- Requesting dangerous permissions
- Accessing sensitive device APIs
- Degrading user experience with autoplay

## Testing

### Verify Header Presence
```bash
# Production
curl -I https://chainreact.app | grep -i permissions-policy

# Expected output:
# Permissions-Policy: camera=(), microphone=(), geolocation=(), ...
```

### Browser DevTools
1. Open Developer Tools (F12)
2. Navigate to Network tab
3. Load any page
4. Check Response Headers for `Permissions-Policy`

### Security Scanners
Run security scans with tools like:
- OWASP ZAP
- Mozilla Observatory
- Security Headers (securityheaders.com)

## Related Security Headers

This header works alongside other security headers:
- `X-Frame-Options: DENY` - Prevents clickjacking
- `Content-Security-Policy: frame-ancestors 'none'` - Modern clickjacking protection
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `Strict-Transport-Security` - Enforces HTTPS

## Future Considerations

### Relaxing Policies (If Needed)
If features are added that require specific permissions:

```typescript
// Example: Allow camera for same-origin only
'camera=(self)'

// Example: Allow specific subdomain
'camera=(https://media.chainreact.app)'
```

### New Directives
Monitor for new Permissions-Policy directives as browsers evolve:
- `idle-detection`
- `screen-wake-lock`
- `web-share`
- `window-placement`

## References
- [MDN: Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy)
- [W3C Feature Policy Spec](https://w3c.github.io/webappsec-feature-policy/)
- [Chrome Feature Policy](https://developer.chrome.com/blog/feature-policy/)
- [Smashing Magazine Guide](https://www.smashingmagazine.com/2018/12/feature-policy/)

## Changelog

### 2025-10-23
- **Added**: Comprehensive Permissions-Policy header with 16 directives
- **Updated**: [next.config.mjs](next.config.mjs) - Global page coverage
- **Updated**: [lib/utils/cors.ts](lib/utils/cors.ts) - API route coverage
- **Security**: Blocks all sensitive device features except fullscreen (self-only)
