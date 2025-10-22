/**
 * SMS Notification Service using Twilio
 */

import { logger } from '@/lib/utils/logger'

interface TwilioMessage {
  to: string
  body: string
}

/**
 * Send SMS notification via Twilio
 */
export async function sendSMS(to: string, message: string): Promise<boolean> {
  try {
    // Validate environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_PHONE_NUMBER

    if (!accountSid || !authToken || !fromNumber) {
      logger.error('Twilio credentials not configured')
      return false
    }

    // Validate phone number format
    if (!to || !to.match(/^\+?[1-9]\d{1,14}$/)) {
      logger.error('Invalid phone number format:', to)
      return false
    }

    // Import Twilio dynamically (only when needed)
    const twilio = (await import('twilio')).default
    const client = twilio(accountSid, authToken)

    // Send SMS
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to,
    })

    logger.info('SMS sent successfully:', {
      to,
      sid: result.sid,
      status: result.status
    })

    return true
  } catch (error: any) {
    logger.error('Failed to send SMS:', {
      error: error.message,
      to,
    })
    return false
  }
}

/**
 * Format phone number to E.164 format
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '')

  // If it doesn't start with country code, assume US (+1)
  if (!phone.startsWith('+')) {
    return `+1${cleaned}`
  }

  return `+${cleaned}`
}
