import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from '@/lib/supabase/admin'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, token } = body

    if (!userId || !token) {
      return errorResponse('Missing userId or token' , 400)
    }

    // Verify the token
    try {
      const decodedToken = Buffer.from(token, 'base64').toString()
      const [tokenUserId, timestamp] = decodedToken.split(':')
      
      if (tokenUserId !== userId) {
        return errorResponse('Invalid token' , 400)
      }

      // Check if token is not too old (24 hours)
      const tokenAge = Date.now() - parseInt(timestamp, 10)
      if (tokenAge > 24 * 60 * 60 * 1000) {
        return errorResponse('Confirmation link has expired' , 400)
      }
    } catch (tokenError) {
      return errorResponse('Invalid token format' , 400)
    }

    const supabase = createAdminClient()

    // Manually confirm the user's email
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      email_confirm: true
    })

    if (error) {
      logger.error('Error confirming user email:', error)
      return errorResponse('Failed to confirm email' , 500)
    }

    logger.debug('User email confirmed successfully:', userId)
    return jsonResponse({
      success: true,
      message: 'Email confirmed successfully'
    })

  } catch (error) {
    logger.error('Error in manual confirmation:', error)
    return errorResponse('Internal server error' , 500)
  }
}