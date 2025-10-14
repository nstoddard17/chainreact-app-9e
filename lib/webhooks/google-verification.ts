import { NextRequest } from 'next/server'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

export async function verifyGoogleWebhook(request: NextRequest): Promise<boolean> {
  try {
    // Google Pub/Sub uses JWT tokens for authentication
    const authorization = request.headers.get('authorization')

    if (!authorization) {
      // Google Calendar/Drive/Sheets webhooks do not include an Authorization header.
      // We accept the request and rely on channel tokens for validation.
      return true
    }

    // TODO: verify Google-signed JWT when provided (mainly for Pub/Sub pushes)
    return true
  } catch (error) {
    logger.error('Error verifying Google webhook:', error)
    return false
  }
}

export async function verifyGmailWebhook(request: NextRequest): Promise<boolean> {
  try {
    // Gmail webhooks use a different verification method
    const token = request.headers.get('x-goog-channel-token')
    
    if (!token) {
      logger.warn('No channel token found for Gmail webhook')
      return true // Allow unsigned webhooks for development
    }

    // Verify the token matches our expected token
    const expectedToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_WEBHOOK_TOKEN
    if (expectedToken && token !== expectedToken) {
      logger.error('Invalid Gmail webhook token')
      return false
    }

    return true
  } catch (error) {
    logger.error('Error verifying Gmail webhook:', error)
    return false
  }
} 
