/**
 * Slack Send Message Test API
 *
 * Sends a REAL test message to Slack with test badge/metadata.
 * Based on industry standards (Zapier, Make.com) - test messages are actually sent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { safeDecrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { integrationId, channel, message, attachments, isTest } = body

    logger.info('🧪 Testing Slack send message', { integrationId, channel, isTest })

    // Get integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('access_token, user_id')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'Slack integration not found' },
        { status: 404 }
      )
    }

    // Decrypt access token
    const accessToken = safeDecrypt(integration.access_token)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to decrypt Slack access token' },
        { status: 500 }
      )
    }

    // Prepare message with test badge
    const testMessage = isTest ? `🧪 **ChainReact Test Message**\n\n${message}` : message

    const testAttachments = isTest ? [
      {
        color: '#36a64f',
        title: '🔬 This is a test from ChainReact',
        text: 'Your workflow is configured correctly! This test confirms your Slack integration works.',
        footer: 'ChainReact Test • You can safely delete this message',
        footer_icon: 'https://chainreact.app/favicon.ico'
      },
      ...(attachments || [])
    ] : attachments

    // Send message to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        text: testMessage,
        attachments: testAttachments,
        metadata: {
          event_type: 'chainreact_test',
          event_payload: {
            test: true,
            integration_id: integrationId
          }
        }
      })
    })

    const slackData = await slackResponse.json()

    if (!slackData.ok) {
      logger.error('Slack API error:', slackData)
      return NextResponse.json(
        { error: slackData.error || 'Failed to send message to Slack' },
        { status: 400 }
      )
    }

    logger.info('✅ Slack test message sent successfully', {
      ts: slackData.ts,
      channel: slackData.channel
    })

    return NextResponse.json({
      success: true,
      ts: slackData.ts,
      channel: slackData.channel,
      message: slackData.message
    })

  } catch (error: any) {
    logger.error('Error testing Slack send message:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
