import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

export async function POST(
  request: Request,
  { params }: { params: { webhookId: string } }
) {
  const supabase = await createSupabaseRouteHandlerClient()
  const { webhookId } = params
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the webhook configuration
    const { data: webhook, error: webhookError } = await supabase
      .from('custom_webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (webhookError || !webhook) {
      return NextResponse.json({ error: "Webhook not found or unauthorized" }, { status: 404 })
    }

    // Prepare test payload
    const testPayload = {
      message: "This is a test webhook from ChainReact",
      timestamp: new Date().toISOString(),
      test: true,
      webhook_id: webhookId
    }

    // Process body template if provided
    let body = testPayload
    if (webhook.body_template) {
      try {
        // Simple template processing
        let processedBody = webhook.body_template
        processedBody = processedBody.replace(/\{\{timestamp\}\}/g, testPayload.timestamp)
        processedBody = processedBody.replace(/\{\{webhook_id\}\}/g, webhookId)
        
        // Try to parse as JSON if it looks like JSON
        if (processedBody.trim().startsWith('{')) {
          body = JSON.parse(processedBody)
        } else {
          body = { message: processedBody }
        }
      } catch (error) {
        console.error('Error processing body template:', error)
        body = testPayload
      }
    }

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ChainReact-Webhook/1.0',
      'X-Webhook-ID': webhookId,
      'X-Test-Request': 'true',
      ...webhook.headers
    }

    // Make the webhook request
    const startTime = Date.now()
    let response
    let statusCode
    let responseBody
    let errorMessage

    try {
      const requestOptions: RequestInit = {
        method: webhook.method,
        headers: headers,
        timeout: 10000 // 10 second timeout
      }

      // Add body for non-GET requests
      if (webhook.method !== 'GET') {
        requestOptions.body = JSON.stringify(body)
      }

      response = await fetch(webhook.webhook_url, requestOptions)
      statusCode = response.status
      responseBody = await response.text()
    } catch (error: any) {
      errorMessage = error.message
      statusCode = 0
    }

    const executionTime = Date.now() - startTime

    // Log the execution
    const { error: logError } = await supabase
      .from('custom_webhook_executions')
      .insert({
        webhook_id: webhookId,
        user_id: user.id,
        status: errorMessage ? 'error' : (statusCode >= 200 && statusCode < 300 ? 'success' : 'error'),
        response_code: statusCode,
        response_body: responseBody,
        error_message: errorMessage,
        execution_time_ms: executionTime,
        triggered_at: new Date().toISOString(),
        payload_sent: body
      })

    if (logError) {
      console.error('Error logging webhook execution:', logError)
    }

    // Update webhook stats
    const updateData: any = {
      last_triggered: new Date().toISOString(),
      trigger_count: webhook.trigger_count + 1
    }

    if (errorMessage || (statusCode && (statusCode < 200 || statusCode >= 300))) {
      updateData.error_count = webhook.error_count + 1
    }

    await supabase
      .from('custom_webhooks')
      .update(updateData)
      .eq('id', webhookId)

    // Return test result
    if (errorMessage) {
      return NextResponse.json({
        success: false,
        error: errorMessage,
        executionTime
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      statusCode,
      responseBody,
      executionTime,
      message: `Webhook test completed in ${executionTime}ms`
    })

  } catch (error: any) {
    console.error(`Error in POST /api/custom-webhooks/${webhookId}/test:`, error)
    return NextResponse.json({ 
      error: "Internal server error",
      details: error.message 
    }, { status: 500 })
  }
} 