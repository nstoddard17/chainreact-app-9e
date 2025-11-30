/**
 * Error Reports API
 *
 * Collects error reports from failed action/trigger tests.
 * Stores reports and optionally notifies the team for immediate action.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    // Create client inside handler to avoid build-time initialization
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    const body = await request.json()

    const {
      errorCode,
      errorMessage,
      errorDetails,
      nodeType,
      providerId,
      config,
      userDescription,
      userEmail,
      timestamp,
      userAgent
    } = body

    logger.info('📥 Error report received', {
      errorCode,
      nodeType,
      providerId
    })

    // Sanitize config - remove sensitive fields
    const sanitizedConfig = config ? Object.fromEntries(
      Object.entries(config).filter(([key]) =>
        !['accessToken', 'refresh_token', 'apiKey', 'secret', 'password', 'token', 'connection'].some(
          sensitive => key.toLowerCase().includes(sensitive.toLowerCase())
        )
      )
    ) : undefined

    // Store in database
    const { error: dbError } = await supabase
      .from('error_reports')
      .insert({
        error_code: errorCode,
        error_message: errorMessage,
        error_details: errorDetails,
        node_type: nodeType,
        provider_id: providerId,
        config: sanitizedConfig,
        user_description: userDescription,
        user_email: userEmail,
        user_agent: userAgent,
        created_at: timestamp || new Date().toISOString()
      })

    if (dbError) {
      logger.error('Failed to store error report:', dbError)
      // Don't fail the request, just log it
    }

    // Optional: Send notification to team via configured webhook
    try {
      const { data: webhookSetting } = await supabase
        .from('webhook_settings')
        .select('*')
        .eq('setting_key', 'error_reports')
        .eq('enabled', true)
        .single()

      if (webhookSetting && webhookSetting.webhook_url) {
        // Prepare payload based on webhook type
        let payload
        if (webhookSetting.webhook_type === 'discord') {
          payload = {
            embeds: [{
              title: '🚨 Test Error Report',
              color: 0xff0000, // Red
              fields: [
                { name: 'Error', value: `\`${errorCode}\`: ${errorMessage}`, inline: false },
                { name: 'Node', value: `${providerId} - ${nodeType}`, inline: true },
                { name: 'User Email', value: userEmail || 'Not provided', inline: true },
                { name: 'Description', value: userDescription || 'None', inline: false },
              ],
              timestamp: timestamp || new Date().toISOString()
            }]
          }
        } else if (webhookSetting.webhook_type === 'slack') {
          payload = {
            text: '🚨 *Test Error Report*',
            attachments: [{
              color: 'danger',
              fields: [
                { title: 'Error', value: `\`${errorCode}\`: ${errorMessage}`, short: false },
                { title: 'Node', value: `${providerId} - ${nodeType}`, short: true },
                { title: 'User Email', value: userEmail || 'Not provided', short: true },
                { title: 'Description', value: userDescription || 'None', short: false },
              ],
              ts: Math.floor(new Date(timestamp || Date.now()).getTime() / 1000)
            }]
          }
        } else {
          // Custom webhook - send generic JSON
          payload = {
            type: 'error_report',
            error_code: errorCode,
            error_message: errorMessage,
            error_details: errorDetails,
            node_type: nodeType,
            provider_id: providerId,
            user_description: userDescription,
            user_email: userEmail,
            timestamp: timestamp || new Date().toISOString()
          }
        }

        await fetch(webhookSetting.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        logger.info('Error report notification sent to configured webhook')
      }
    } catch (notifyError) {
      logger.error('Failed to send error notification:', notifyError)
      // Don't fail the request
    }

    return NextResponse.json({
      success: true,
      message: 'Error report received'
    })

  } catch (error: any) {
    logger.error('Error handling error report:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
