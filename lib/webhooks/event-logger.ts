import { createSupabaseServiceClient } from '@/utils/supabase/server'

export interface WebhookEventLog {
  id?: string
  provider: string
  requestId: string
  method?: string
  headers?: Record<string, string>
  service?: string
  eventType?: string
  eventData?: any
  status?: 'success' | 'error' | 'pending'
  processingTime?: number
  result?: any
  error?: string
  timestamp: string
}

const shouldLogWebhookDebug =
  process.env.DEBUG_WEBHOOKS === '1' || process.env.DEBUG_WEBHOOKS === 'true'

export async function logWebhookEvent(logData: WebhookEventLog): Promise<void> {
  try {
    const supabase = await createSupabaseServiceClient()
    
    // Store in database for persistence
    await supabase
      .from('webhook_event_logs')
      .insert({
        provider: logData.provider,
        request_id: logData.requestId,
        method: logData.method,
        headers: logData.headers,
        service: logData.service,
        event_type: logData.eventType,
        event_data: logData.eventData,
        status: logData.status,
        processing_time_ms: logData.processingTime,
        result: logData.result,
        error: logData.error,
        timestamp: logData.timestamp
      })

    const context = {
      requestId: logData.requestId,
      service: logData.service,
      eventType: logData.eventType,
      status: logData.status,
      processingTime: logData.processingTime,
      error: logData.error
    }

    if (logData.status === 'error' || logData.error) {
      console.error(`[Webhook] ${logData.provider} error`, context)
    } else if (logData.status === 'success') {
      console.log(`[Webhook] ${logData.provider} success`, {
        requestId: logData.requestId,
        service: logData.service,
        processingTime: logData.processingTime
      })
    } else if (shouldLogWebhookDebug) {
      console.log(`[Webhook] ${logData.provider}:`, context)
    }

  } catch (error) {
    // Fallback to console logging if database fails
    console.error('Failed to log webhook event:', error)
    console.log('Webhook event data:', logData)
  }
}

export async function getWebhookEventLogs(
  provider?: string,
  limit: number = 100
): Promise<WebhookEventLog[]> {
  try {
    const supabase = await createSupabaseServiceClient()
    
    let query = supabase
      .from('webhook_event_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (provider) {
      query = query.eq('provider', provider)
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch webhook logs:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Failed to fetch webhook logs:', error)
    return []
  }
} 
