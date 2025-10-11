# Logging Best Practices

**CRITICAL**: This document defines MANDATORY logging rules for ChainReact. ALL logging must follow these practices without exception.

## 🚨 NEVER Log These - Security & Privacy

### Absolutely Forbidden
1. **Encryption/Master Keys** - Never log keys, salts, or crypto material
2. **OAuth Tokens** - No access tokens, refresh tokens, or API keys (not even previews)
3. **Passwords** - Never log passwords, even hashed
4. **Session Tokens** - No session IDs or authentication tokens
5. **Client Secrets** - OAuth client secrets, webhook secrets, etc.
6. **Credit Card Data** - PCI compliance violation
7. **Social Security Numbers** - HIPAA/PII violation
8. **Full Email Content** - Privacy violation

### Personal Identifiable Information (PII)
9. **Email Addresses** - Mask or redact: `m***@g***.com`
10. **Phone Numbers** - Mask or redact
11. **Physical Addresses** - Never log
12. **User Names** - Use user IDs instead
13. **Message Content** - Subject lines, body content
14. **File Names** - May contain sensitive info

### Internal Identifiers (Context-Dependent)
15. **Microsoft Graph Resource IDs** - Can be used to access resources
16. **Database Primary Keys** - Only log if necessary, never in error messages
17. **Internal URLs** - May expose architecture
18. **Subscription IDs** - External system identifiers

## ✅ Safe to Log - Operational Data

### Always Safe
- ✅ Execution flow events (started, completed, failed)
- ✅ Node types and counts
- ✅ Execution times and performance metrics
- ✅ Error types (without sensitive context)
- ✅ Status changes (pending → running → completed)
- ✅ Workflow IDs (internal, non-sensitive)
- ✅ Node IDs (internal, non-sensitive)
- ✅ Execution session IDs
- ✅ Change types (created, updated, deleted)
- ✅ Provider names (gmail, slack, notion)
- ✅ Action types (send_email, create_task)

### Safe with Masking
- ⚠️ Email addresses → `m***@g***.com` or count: `2 recipients`
- ⚠️ Subject lines → `Subject length: 42 chars` or first 3 words
- ⚠️ Configuration values → Log keys only: `{to: '[REDACTED]', subject: '[REDACTED]'}`
- ⚠️ Error messages → Sanitize before logging

## 📋 Logging Levels

### Production (`process.env.NODE_ENV === 'production'`)
- **ERROR**: Critical failures only, sanitized
- **WARN**: Non-critical issues, sanitized
- **INFO**: High-level flow (workflow started/completed)
- **DEBUG**: DISABLED in production

### Development (`process.env.NODE_ENV === 'development'`)
- **ERROR**: Full stack traces (still sanitize tokens/keys)
- **WARN**: All warnings
- **INFO**: Detailed flow information
- **DEBUG**: Verbose debugging (still no secrets)

### Test Mode
- Use `testMode` flag to enable additional safe logging
- Still follow security rules (tests may run in CI/CD)

## 🔧 Implementation Patterns

### ❌ BAD - Logging Sensitive Data
```typescript
console.log('Master key:', masterKey);
console.log('Access token:', accessToken);
console.log('Email to:', email);
console.log('Message body:', messageBody);
console.log('Config:', config); // May contain tokens
```

### ✅ GOOD - Safe Logging
```typescript
console.log('Master key initialized'); // No value
console.log('Token acquired for provider:', provider); // No token
console.log('Email sent to recipient count:', recipients.length);
console.log('Message body length:', messageBody.length);
console.log('Config keys:', Object.keys(config)); // Keys only
```

### ✅ GOOD - Masked Logging
```typescript
import { maskEmail, maskToken, redactConfig } from '@/lib/utils/logging';

console.log('Email to:', maskEmail(email)); // m***@g***.com
console.log('Token status:', accessToken ? 'present' : 'missing');
console.log('Config:', redactConfig(config)); // Sensitive values redacted
```

### ✅ GOOD - Conditional Verbose Logging
```typescript
if (process.env.LOG_LEVEL === 'debug' && process.env.NODE_ENV === 'development') {
  console.log('Detailed workflow structure:', {
    nodeTypes: nodes.map(n => n.type),
    edgeCount: edges.length,
    // Still no tokens/PII
  });
}
```

## 🛡️ Utility Functions (Required)

Create these in `/lib/utils/logging.ts`:

```typescript
/**
 * Mask email address: user@domain.com → u***@d***.com
 */
export function maskEmail(email: string): string;

/**
 * Indicate token presence without exposing value
 */
export function maskToken(token: string | null | undefined): string; // 'present' | 'missing'

/**
 * Redact sensitive config values, keep structure
 */
export function redactConfig(config: Record<string, any>): Record<string, any>;

/**
 * Sanitize error messages that may contain sensitive data
 */
export function sanitizeError(error: Error): string;

/**
 * Check if value contains potential PII/sensitive data
 */
export function containsSensitiveData(value: any): boolean;
```

## 📊 Compliance Requirements

### GDPR (General Data Protection Regulation)
- ❌ Don't log EU user PII without consent
- ✅ Implement log retention policies (30-90 days max)
- ✅ Support data deletion requests (clear logs)

### SOC2 (Security Compliance)
- ❌ Don't log authentication credentials
- ✅ Log security events (failed auth, permission changes)
- ✅ Implement audit trails (who did what, when)

### HIPAA (Healthcare)
- ❌ Don't log Protected Health Information (PHI)
- ✅ Encrypt logs at rest and in transit
- ✅ Implement access controls for logs

## 🔍 Log Review Checklist

Before committing code with logging:

- [ ] No master keys, encryption keys, or salts
- [ ] No OAuth tokens, API keys, or secrets
- [ ] No passwords or session tokens
- [ ] Email addresses masked or redacted
- [ ] Message content not logged (or sanitized)
- [ ] Configuration values redacted (keys only)
- [ ] Error messages sanitized
- [ ] Token presence indicated, not value
- [ ] User IDs used instead of names/emails
- [ ] Logging level appropriate for environment
- [ ] PII marked for compliance review
- [ ] Sensitive IDs redacted or justified

## 🚨 Incident Response

If sensitive data is logged:

1. **Immediate**: Remove from codebase
2. **Rotate**: Rotate any exposed keys/tokens immediately
3. **Purge**: Clear production logs containing sensitive data
4. **Notify**: Security team and affected users (if PII)
5. **Document**: Post-mortem and prevention measures
6. **Review**: Audit all logging in related code

## 📝 Examples by Use Case

### Workflow Execution
```typescript
// ✅ GOOD
console.log('[info] Workflow execution started', {
  workflowId,
  userId, // Internal ID, not email
  nodeCount: nodes.length,
  executionMode: testMode ? 'test' : 'live'
});

// ❌ BAD
console.log('[info] Workflow execution started', {
  workflowId,
  userEmail: user.email, // PII
  nodes, // May contain config with tokens
  config // May contain tokens
});
```

### OAuth Token Management
```typescript
// ✅ GOOD
console.log('[info] Token acquired for provider', {
  provider,
  hasAccessToken: !!accessToken,
  hasRefreshToken: !!refreshToken,
  expiresIn: tokenData.expires_in
});

// ❌ BAD
console.log('[info] Token acquired', {
  accessToken, // NEVER
  refreshToken, // NEVER
  tokenPreview: accessToken.slice(0, 10) // STILL BAD
});
```

### Email Actions
```typescript
// ✅ GOOD
console.log('[info] Email action executed', {
  provider: 'gmail',
  recipientCount: recipients.length,
  subjectLength: subject.length,
  hasAttachments: attachments.length > 0
});

// ❌ BAD
console.log('[info] Email action executed', {
  to: 'user@example.com', // PII
  subject: 'Password reset', // Content
  body: messageBody // Content
});
```

### Error Logging
```typescript
// ✅ GOOD
console.error('[error] Integration fetch failed', {
  provider,
  errorType: error.constructor.name,
  errorMessage: sanitizeError(error),
  userId // Internal ID
});

// ❌ BAD
console.error('[error] Integration fetch failed', {
  provider,
  error: error.message, // May contain tokens/PII
  user: user.email, // PII
  accessToken // NEVER
});
```

### Webhook Processing
```typescript
// ✅ GOOD
console.log('[info] Webhook received', {
  provider: 'microsoft-graph',
  changeType: notification.changeType,
  resourceType: notification.resourceData?.['@odata.type'],
  hasClientState: !!notification.clientState,
  subscriptionId: notification.subscriptionId.slice(0, 8) + '...' // Truncated
});

// ❌ BAD
console.log('[info] Webhook received', {
  fullPayload: JSON.stringify(body), // May contain PII
  resourceId: notification.resource, // Can access resource
  userEmail: email, // PII
  messageContent: message.body // Content
});
```

## 🔄 Migration Path for Existing Code

1. **Audit**: Run grep for logging statements
2. **Identify**: Flag sensitive data being logged
3. **Refactor**: Replace with safe alternatives
4. **Test**: Verify logs don't expose sensitive data
5. **Document**: Update this guide with new patterns

## 🎯 Quick Reference

| Data Type | Log? | How? |
|-----------|------|------|
| Encryption keys | ❌ NEVER | "Key initialized" |
| OAuth tokens | ❌ NEVER | `hasToken: true/false` |
| Passwords | ❌ NEVER | N/A |
| Email addresses | ⚠️ MASK | `m***@g***.com` or count |
| Message content | ⚠️ REDACT | Length or summary only |
| User IDs | ✅ YES | Internal IDs only |
| Workflow IDs | ✅ YES | Safe to log |
| Execution times | ✅ YES | Safe to log |
| Error types | ✅ YES | Sanitize messages |
| Node types | ✅ YES | Safe to log |
| Provider names | ✅ YES | Safe to log |

---

**Remember**: When in doubt, DON'T log it. You can always add more logging later, but you can't un-leak sensitive data.

**Enforcement**: All PRs with new logging MUST reference this guide and pass security review.
