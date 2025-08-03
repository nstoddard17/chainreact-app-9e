import { NextRequest } from 'next/server'
import crypto from 'crypto'

export async function verifyGoogleWebhook(request: NextRequest): Promise<boolean> {
  try {
    // Google Pub/Sub uses JWT tokens for authentication
    const authorization = request.headers.get('authorization')
    
    if (!authorization) {
      console.warn('No authorization header found for Google webhook')
      return true // Allow unsigned webhooks for development
    }

    // For production, you would verify the JWT token here
    // For now, we'll allow all requests in development
    return true
  } catch (error) {
    console.error('Error verifying Google webhook:', error)
    return false
  }
}

export async function verifyGmailWebhook(request: NextRequest): Promise<boolean> {
  try {
    // Gmail webhooks use a different verification method
    const token = request.headers.get('x-goog-channel-token')
    
    if (!token) {
      console.warn('No channel token found for Gmail webhook')
      return true // Allow unsigned webhooks for development
    }

    // Verify the token matches our expected token
    const expectedToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_WEBHOOK_TOKEN
    if (expectedToken && token !== expectedToken) {
      console.error('Invalid Gmail webhook token')
      return false
    }

    return true
  } catch (error) {
    console.error('Error verifying Gmail webhook:', error)
    return false
  }
} 