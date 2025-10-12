
import { NextRequest } from 'next/server'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

const SLACK_SIGNATURE_VERSION = 'v0'
const SLACK_MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5 // 5 minutes

export async function verifyWebhookSignature(
  request: NextRequest,
  provider: string
): Promise<boolean> {
  try {
    const secret = getWebhookSecret(provider)

    if (!secret) {
      logger.warn(`No secret configured for ${provider} webhook`)
      return true // Allow unsigned webhooks for development
    }

    if (provider === 'slack') {
      const signature = request.headers.get('x-slack-signature')
      const timestamp = request.headers.get('x-slack-request-timestamp')

      if (!signature || !timestamp) {
        logger.warn('Missing Slack signature or timestamp header, skipping verification')
        return true
      }

      const body = await request.text()
      return verifySlackSignature(body, signature, timestamp, secret)
    }

    if (provider === 'trello') {
      // Trello webhooks do not use our generic signature mechanism. Validation is done via callback challenge.
      return true
    }

    const signature = request.headers.get('x-signature') ||
                     request.headers.get('x-hub-signature') ||
                     request.headers.get('x-discord-signature') ||
                     request.headers.get('x-slack-signature')

    if (!signature) {
      logger.warn(`No signature found for ${provider} webhook`)
      return true // Allow unsigned webhooks for development
    }

    const body = await request.text()

    switch (provider) {
      case 'discord':
        return verifyDiscordSignature(body, signature, secret)
      case 'github':
        return verifyGitHubSignature(body, signature, secret)
      case 'notion':
        return verifyNotionSignature(body, signature, secret)
      default:
        return verifyGenericSignature(body, signature, secret)
    }
  } catch (error) {
    logger.error(`Error verifying ${provider} webhook signature:`, error)
    return false
  }
}

function getWebhookSecret(provider: string): string | null {
  const secrets: Record<string, string> = {
    discord: process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_WEBHOOK_SECRET || '',
    slack: process.env.SLACK_SIGNING_SECRET || process.env.SLACK_WEBHOOK_SECRET || '',
    github: process.env.GITHUB_ACCESS_TOKEN || process.env.GITHUB_WEBHOOK_SECRET || '',
    notion: process.env.NOTION_API_KEY || process.env.NOTION_WEBHOOK_SECRET || '',
    // Add more providers as needed
  }

  return secrets[provider] || null
}

function verifySlackSignature(body: string, signature: string, timestamp: string, secret: string): boolean {
  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds)) {
    logger.warn('Invalid Slack timestamp header')
    return false
  }

  const currentTimestampSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(currentTimestampSeconds - timestampSeconds) > SLACK_MAX_TIMESTAMP_SKEW_SECONDS) {
    logger.warn('Slack request timestamp outside of allowed tolerance window')
    return false
  }

  const sigBaseString = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${body}`
  const expectedSignature = `${SLACK_SIGNATURE_VERSION}=${ crypto
    .createHmac('sha256', secret)
    .update(sigBaseString)
    .digest('hex')}`

  const signatureBuffer = Buffer.from(signature, 'utf8')
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8')

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
}

function verifyDiscordSignature(body: string, signature: string, secret: string): boolean {
  const timestamp = signature.split(',')[0].split('=')[1]
  const sig = signature.split(',')[1].split('=')[1]

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(timestamp + body)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(sig, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )
}

function verifyGitHubSignature(body: string, signature: string, secret: string): boolean {
  const sig = signature.replace('sha256=', '')

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(sig, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )
}

function verifyNotionSignature(body: string, signature: string, secret: string): boolean {
  const sig = signature.replace('v0=', '')

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(sig, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )
}

function verifyGenericSignature(body: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  return signature === expectedSignature
}
