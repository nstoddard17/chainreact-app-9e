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
      .from('webhook_configs')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (webhookError || !webhook) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 })
    }

    // Prepare test payload
    const testPayload = {
      message: "Test webhook from ChainReact",
      timestamp: new Date().toISOString(),
      webhook_id: webhookId,
      test: true
    }

    // Send test request to the webhook URL
    const startTime = Date.now()
    let response
    let statusCode
    let responseBody
    let errorMessage

    try {
      const fetchOptions: RequestInit = {
        method: webhook.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...webhook.headers
        }
      }

      if (webhook.method !== 'GET') {
        fetchOptions.body = JSON.stringify(testPayload)
      }

      response = await fetch(webhook.webhook_url, fetchOptions)
      statusCode = response.status
      responseBody = await response.text()
    } catch (fetchError: any) {
      errorMessage = fetchError.message
      statusCode = 0
    }

    const executionTime = Date.now() - startTime

    // Log the execution
    await supabase
      .from('webhook_executions')
      .insert({
        webhook_id: webhookId,
        user_id: user.id,
        trigger_type: 'test',
        provider_id: 'custom',
        payload: testPayload,
        headers: webhook.headers,
        status: errorMessage ? 'error' : 'success',
        error_message: errorMessage,
        execution_time_ms: executionTime
      })

    // Update webhook stats
    const updateData: any = {
      last_triggered: new Date().toISOString(),
      trigger_count: webhook.trigger_count + 1
    }

    if (errorMessage) {
      updateData.error_count = (webhook.error_count || 0) + 1
    }

    await supabase
      .from('webhook_configs')
      .update(updateData)
      .eq('id', webhookId)

    return NextResponse.json({
      success: !errorMessage,
      statusCode,
      responseBody,
      errorMessage,
      executionTime
    })

  } catch (error: any) {
    console.error(`Error in POST /api/custom-webhooks/${webhookId}/test:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 