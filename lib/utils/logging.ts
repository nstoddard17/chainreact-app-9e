import { logger } from '@/lib/utils/logger'

/**
 * Logging Utility Functions
 *
 * CRITICAL: These utilities enforce secure logging practices.
 * See /learning/docs/logging-best-practices.md for complete guidelines.
 *
 * NEVER log: tokens, keys, passwords, PII, message content
 */

/**
 * Mask email address to protect PII
 * Example: user@domain.com → u***@d***.com
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '[no-email]';

  const [local, domain] = email.split('@');
  if (!domain) return '[invalid-email]';

  const maskedLocal = local.charAt(0) + '***';
  const domainParts = domain.split('.');
  const maskedDomain = domainParts.map(part => part.charAt(0) + '***').join('.');

  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Indicate token presence without exposing value
 * NEVER log token values, even partially
 */
export function maskToken(token: string | null | undefined): string {
  return token ? 'present' : 'missing';
}

/**
 * Redact sensitive configuration values while preserving structure
 * Keeps keys visible for debugging, redacts all values
 */
export function redactConfig(config: Record<string, any>): Record<string, any> {
  const sensitiveKeys = [
    'token', 'password', 'secret', 'key', 'apikey', 'api_key',
    'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
    'bearer', 'authorization', 'auth', 'credentials', 'privatekey',
    'private_key', 'clientsecret', 'client_secret', 'masterkey',
    'master_key', 'sessionid', 'session_id', 'cookie'
  ];

  const piiKeys = [
    'email', 'phone', 'address', 'ssn', 'name', 'firstname', 'lastname',
    'to', 'from', 'cc', 'bcc', 'subject', 'body', 'message', 'content',
    'text', 'description'
  ];

  const redacted: Record<string, any> = {};

  for (const [key, value] of Object.entries(config)) {
    const lowerKey = key.toLowerCase();

    // Check if key is sensitive
    const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk));
    const isPII = piiKeys.some(pk => lowerKey.includes(pk));

    if (isSensitive) {
      redacted[key] = '[REDACTED-SENSITIVE]';
    } else if (isPII) {
      redacted[key] = '[REDACTED-PII]';
    } else if (typeof value === 'object' && value !== null) {
      // Recursively redact nested objects
      redacted[key] = Array.isArray(value)
        ? value.map(v => typeof v === 'object' && v !== null ? redactConfig(v) : v)
        : redactConfig(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Sanitize error messages that may contain sensitive data
 * Removes common patterns of tokens, emails, and secrets from error messages
 */
export function sanitizeError(error: Error | unknown): string {
  if (!error) return 'Unknown error';

  let message = error instanceof Error ? error.message : String(error);

  // Remove potential tokens (long alphanumeric strings)
  message = message.replace(/[a-zA-Z0-9_-]{30,}/g, '[TOKEN]');

  // Remove email addresses
  message = message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  // Remove URLs with potential tokens
  message = message.replace(/https?:\/\/[^\s]+/g, '[URL]');

  // Remove bearer tokens
  message = message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [TOKEN]');

  // Remove authorization headers
  message = message.replace(/authorization:\s*[^\s,}]+/gi, 'authorization: [REDACTED]');

  return message;
}

/**
 * Check if a value potentially contains sensitive data
 * Use this before logging unknown values
 */
export function containsSensitiveData(value: any): boolean {
  if (!value) return false;

  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const lowerStr = str.toLowerCase();

  const sensitivePatterns = [
    'token', 'password', 'secret', 'key', 'bearer',
    'authorization', 'credentials', 'private', 'master'
  ];

  return sensitivePatterns.some(pattern => lowerStr.includes(pattern));
}

/**
 * Safe log formatter for structured logging
 * Automatically redacts sensitive fields
 */
export function safeLog(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logPrefix = `${timestamp} [${level}]`;

  if (!data) {
    logger.debug(`${logPrefix} ${message}`);
    return;
  }

  // Automatically redact configuration
  const safeData = redactConfig(data);

  logger.debug(`${logPrefix} ${message}`, safeData);
}

/**
 * Format user-safe metadata for logging
 * Extracts only safe metadata about objects
 */
export function getSafeMetadata(data: any): Record<string, any> {
  if (!data) return { hasData: false };

  const metadata: Record<string, any> = {
    type: typeof data,
    isArray: Array.isArray(data),
  };

  if (Array.isArray(data)) {
    metadata.length = data.length;
    metadata.itemTypes = [...new Set(data.map(item => typeof item))];
  } else if (typeof data === 'object') {
    metadata.keys = Object.keys(data);
    metadata.keyCount = Object.keys(data).length;
  } else if (typeof data === 'string') {
    metadata.length = data.length;
    metadata.preview = data.substring(0, 20) + (data.length > 20 ? '...' : '');
  }

  return metadata;
}

/**
 * Mask resource IDs to prevent resource access
 * Shows only enough to debug (first 8 chars)
 */
export function maskResourceId(id: string | null | undefined): string {
  if (!id || typeof id !== 'string') return '[no-id]';
  if (id.length <= 8) return id;

  return id.substring(0, 8) + '...';
}

/**
 * Count recipients instead of logging email addresses
 */
export function getRecipientCount(recipients: string | string[] | null | undefined): number {
  if (!recipients) return 0;
  if (typeof recipients === 'string') return 1;
  return Array.isArray(recipients) ? recipients.length : 0;
}

/**
 * Safe integration logging
 * Logs integration status without exposing provider data
 */
export function logIntegrationStatus(
  provider: string,
  userId: string,
  hasToken: boolean,
  action: string
) {
  safeLog('info', 'Integration action', {
    provider,
    userId: maskResourceId(userId),
    hasToken,
    action,
    timestamp: new Date().toISOString()
  });
}

/**
 * Safe webhook logging
 * Logs webhook receipt without exposing payload content
 */
export function logWebhookReceived(
  provider: string,
  changeType: string,
  hasPayload: boolean,
  resourceType?: string
) {
  safeLog('info', 'Webhook received', {
    provider,
    changeType,
    hasPayload,
    resourceType,
    timestamp: new Date().toISOString()
  });
}

/**
 * Safe execution logging
 * Logs workflow execution without exposing config/data
 */
export function logWorkflowExecution(
  workflowId: string,
  userId: string,
  nodeCount: number,
  status: 'started' | 'running' | 'completed' | 'failed',
  executionTime?: number
) {
  safeLog('info', 'Workflow execution', {
    workflowId,
    userId: maskResourceId(userId),
    nodeCount,
    status,
    executionTime,
    timestamp: new Date().toISOString()
  });
}
