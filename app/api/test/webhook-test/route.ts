import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/utils/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { provider, eventType, eventData } = await request.json()
    
    // Simulate a webhook event
    const testEvent = {
      provider: provider || 'gmail',
      eventType: eventType || 'message.new',
      eventData: eventData || {
        type: 'message.new',
        message_id: 'test-message-123',
        thread_id: 'test-thread-456',
        from: 'test@example.com',
        subject: 'Test Email',
        body: 'This is a test email for webhook testing'
      }
    }

    console.log('🧪 Testing webhook event:', testEvent)

    // Call the webhook processor directly
    const { processWebhookEvent } = await import('@/lib/webhooks/processor')
    
    const result = await processWebhookEvent({
      provider: testEvent.provider,
      eventData: testEvent.eventData,
      requestId: `test-${Date.now()}`
    })

    return NextResponse.json({
      success: true,
      testEvent,
      result,
      message: 'Webhook test completed successfully'
    })

  } catch (error) {
    console.error('Webhook test error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Webhook Test Endpoint',
    usage: {
      method: 'POST',
      body: {
        provider: 'gmail|discord|slack|github|notion',
        eventType: 'message.new|MESSAGE_CREATE|message|issues|page.created',
        eventData: 'Custom event data object'
      }
    },
    examples: [
      {
        description: 'Test Gmail new message',
        body: {
          provider: 'gmail',
          eventType: 'message.new',
          eventData: {
            type: 'message.new',
            message_id: 'test-123',
            thread_id: 'thread-456',
            from: 'sender@example.com',
            subject: 'Test Subject'
          }
        }
      },
      {
        description: 'Test Discord message',
        body: {
          provider: 'discord',
          eventType: 'MESSAGE_CREATE',
          eventData: {
            type: 'MESSAGE_CREATE',
            content: 'Hello from Discord!',
            author: { username: 'testuser' },
            channel_id: '123456789'
          }
        }
      }
    ]
  })
} 