import { NextRequest } from 'next/server'

export async function verifyGmailWebhook(request: NextRequest): Promise<boolean> {
  try {
    // Gmail webhooks use a different verification method
    const token = request.headers.get('x-goog-channel-token')
    
    if (!token) {
      console.warn('No channel token found for Gmail webhook')
      return true // Allow unsigned webhooks for development
    }

    // Verify the token matches our expected token
    const expectedToken = process.env.GMAIL_WEBHOOK_TOKEN
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