/**
 * Gmail Integration Utilities
 */

import { decrypt } from '@/lib/security/encryption'
import { GmailApiError } from './types'

/**
 * Extract email addresses from header value
 */
export function extractEmailAddresses(headerValue: string): { email: string; name?: string }[] {
  const emails: { email: string; name?: string }[] = []
  
  try {
    if (!headerValue || typeof headerValue !== 'string') {
      return emails
    }

    // Split by comma and clean up each email
    const parts = headerValue.split(',').map(part => part.trim()).filter(Boolean)
    
    parts.forEach(part => {
      try {
        // Match patterns like "Name <email@domain.com>" or just "email@domain.com"
        const nameEmailMatch = part.match(/^(.+?)\s*<([^>]+)>$/)
        const emailOnlyMatch = part.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/)
        
        if (nameEmailMatch) {
          const [, name, email] = nameEmailMatch
          if (email && email.includes('@')) {
            emails.push({
              email: email.trim(),
              name: name.trim().replace(/^["']|["']$/g, '') // Remove quotes
            })
          }
        } else if (emailOnlyMatch) {
          const [, email] = emailOnlyMatch
          emails.push({ email: email.trim() })
        }
      } catch (error) {
        console.warn(`Failed to parse email part: ${part}`, error)
      }
    })
    
    return emails
  } catch (error) {
    console.warn('Failed to extract email addresses:', error)
    return emails
  }
}

/**
 * Create Gmail API error with proper context
 */
export function createGmailApiError(message: string, status?: number, response?: Response): GmailApiError {
  const error = new Error(message) as GmailApiError
  error.status = status
  error.name = 'GmailApiError'
  
  if (status === 401) {
    error.message = 'Gmail authentication expired. Please reconnect your account.'
  } else if (status === 403) {
    error.message = 'Gmail API access forbidden. Check your permissions.'
  } else if (status === 429) {
    error.message = 'Gmail API rate limit exceeded. Please try again later.'
  }
  
  return error
}

/**
 * Get decrypted access token for Gmail integration
 */
export function getGmailAccessToken(integration: any): string {
  if (!integration) {
    throw new Error('Gmail integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Gmail authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'gmail') {
    throw new Error('Invalid integration provider. Expected Gmail.')
  }
  
  try {
    // Decrypt the access token
    const decryptedToken = decrypt(integration.access_token)
    return decryptedToken
  } catch (error: any) {
    console.error('Failed to decrypt Gmail access token:', error.message)
    throw new Error('Gmail token decryption failed. Please reconnect your account.')
  }
}

/**
 * Validate Gmail integration has required access token
 */
export function validateGmailIntegration(integration: any): void {
  if (!integration) {
    throw new Error('Gmail integration not found')
  }
  
  if (!integration.access_token) {
    throw new Error('Gmail authentication required. Please reconnect your account.')
  }
  
  if (integration.provider !== 'gmail') {
    throw new Error('Invalid integration provider. Expected Gmail.')
  }
  
  // Note: We're lenient about status since we have a valid access token
  // The main requirement is having an access token, not a specific status
}

/**
 * Make authenticated request to Gmail API
 */
export async function makeGmailApiRequest(
  url: string, 
  accessToken: string, 
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw createGmailApiError(
      `Gmail API error: ${response.status} - ${response.statusText}`,
      response.status,
      response
    )
  }

  return response
}

/**
 * Get standard Gmail API headers
 */
export function getGmailApiHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}