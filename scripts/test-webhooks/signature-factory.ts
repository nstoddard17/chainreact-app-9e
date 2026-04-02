/**
 * Signature Factory for Webhook Test Harness
 *
 * Generates valid signatures for each provider by reversing
 * the verification logic in the codebase. Each function produces
 * the exact headers the server expects.
 *
 * Source references:
 *   GitHub:  /app/api/webhooks/github/route.ts:24-44
 *   Shopify: /app/api/webhooks/shopify/route.ts:193-222
 *   Slack:   /lib/webhooks/verification.ts:80-107
 *   Monday:  /app/api/webhooks/monday/route.ts:42-70
 *   Discord: /lib/webhooks/verification.ts:109-122
 *   Generic: /lib/webhooks/verification.ts:152-158
 *   Notion:  /lib/webhooks/verification.ts:138-150
 */

import crypto from 'crypto'

export type SignatureScheme =
  | 'github'
  | 'shopify'
  | 'slack'
  | 'monday'
  | 'stripe'
  | 'discord'
  | 'notion'
  | 'generic'
  | 'none'

export interface SignatureResult {
  headers: Record<string, string>
}

/**
 * Compute the correct signature headers for a given provider.
 *
 * @param scheme  - The provider's signature scheme
 * @param rawBody - The raw request body (must be the unmodified fixture)
 * @param secret  - The webhook secret for this provider
 * @returns Headers to include in the test request
 * @throws If secret is missing for a signed scheme
 */
export function computeSignature(
  scheme: SignatureScheme,
  rawBody: string,
  secret: string | undefined
): SignatureResult {
  if (scheme === 'none') {
    return { headers: {} }
  }

  if (!secret) {
    throw new MissingSecretError(scheme)
  }

  switch (scheme) {
    case 'github':
      return computeGitHubSignature(rawBody, secret)
    case 'shopify':
      return computeShopifySignature(rawBody, secret)
    case 'slack':
      return computeSlackSignature(rawBody, secret)
    case 'monday':
      return computeMondaySignature(rawBody, secret)
    case 'stripe':
      return computeStripeSignature(rawBody, secret)
    case 'discord':
      return computeDiscordSignature(rawBody, secret)
    case 'notion':
      return computeNotionSignature(rawBody, secret)
    case 'generic':
      return computeGenericSignature(rawBody, secret)
    default:
      throw new Error(`Unknown signature scheme: ${scheme}`)
  }
}

export class MissingSecretError extends Error {
  scheme: string
  constructor(scheme: string) {
    super(`Missing webhook secret for scheme "${scheme}". Ensure the correct env var is set.`)
    this.name = 'MissingSecretError'
    this.scheme = scheme
  }
}

// --- Provider implementations ---

/**
 * GitHub: HMAC-SHA256 hex with `sha256=` prefix
 * Header: x-hub-signature-256
 */
function computeGitHubSignature(body: string, secret: string): SignatureResult {
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return {
    headers: {
      'x-hub-signature-256': `sha256=${sig}`,
    },
  }
}

/**
 * Shopify: HMAC-SHA256 base64 encoded
 * Header: x-shopify-hmac-sha256
 */
function computeShopifySignature(body: string, secret: string): SignatureResult {
  const sig = crypto.createHmac('sha256', secret).update(body, 'utf-8').digest('base64')
  return {
    headers: {
      'x-shopify-hmac-sha256': sig,
    },
  }
}

/**
 * Slack: v0= + HMAC-SHA256 hex of `v0:{timestamp}:{body}`
 * Headers: x-slack-signature, x-slack-request-timestamp
 */
function computeSlackSignature(body: string, secret: string): SignatureResult {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const sigBaseString = `v0:${timestamp}:${body}`
  const sig = crypto.createHmac('sha256', secret).update(sigBaseString).digest('hex')
  return {
    headers: {
      'x-slack-signature': `v0=${sig}`,
      'x-slack-request-timestamp': timestamp,
    },
  }
}

/**
 * Monday.com: HMAC-SHA256 hex
 * Header: x-monday-signature
 */
function computeMondaySignature(body: string, secret: string): SignatureResult {
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return {
    headers: {
      'x-monday-signature': sig,
    },
  }
}

/**
 * Stripe: t={timestamp},v1={hmac_hex}
 * Header: stripe-signature
 *
 * Uses the same algorithm as Stripe's SDK generateTestHeaderString:
 * signature = HMAC-SHA256(`${timestamp}.${body}`, secret)
 */
function computeStripeSignature(body: string, secret: string): SignatureResult {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const payload = `${timestamp}.${body}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return {
    headers: {
      'stripe-signature': `t=${timestamp},v1=${sig}`,
    },
  }
}

/**
 * Discord: t={timestamp},s={hmac_hex}
 * Header: x-discord-signature
 *
 * Verification expects: HMAC-SHA256(timestamp + body, secret)
 */
function computeDiscordSignature(body: string, secret: string): SignatureResult {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const sig = crypto.createHmac('sha256', secret).update(timestamp + body).digest('hex')
  return {
    headers: {
      'x-discord-signature': `t=${timestamp},s=${sig}`,
    },
  }
}

/**
 * Notion: HMAC-SHA256 hex (no prefix)
 * Header: x-notion-signature
 *
 * The Notion custom route validates via trigger_resources.metadata.verificationToken
 * and compares raw hex digests without a prefix.
 */
function computeNotionSignature(body: string, secret: string): SignatureResult {
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return {
    headers: {
      'x-notion-signature': sig,
    },
  }
}

/**
 * Generic: HMAC-SHA256 hex (no prefix)
 * Header: x-signature
 */
function computeGenericSignature(body: string, secret: string): SignatureResult {
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return {
    headers: {
      'x-signature': sig,
    },
  }
}
