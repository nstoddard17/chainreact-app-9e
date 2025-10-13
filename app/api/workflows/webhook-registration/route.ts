import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { TriggerWebhookManager } from "@/lib/webhooks/triggerWebhookManager"

import { logger } from '@/lib/utils/logger'

const webhookManager = new TriggerWebhookManager()

export async function POST(request: Request) {
  logger.debug('🚨🚨🚨 WEBHOOK REGISTRATION API CALLED! 🚨🚨🚨')
  
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const { workflowId, triggerType, providerId, config } = await request.json()

    if (!workflowId || !triggerType || !providerId) {
      return errorResponse("Missing required fields: workflowId, triggerType, providerId" 
      , 400)
    }

    // Check if trigger supports webhooks
    const supportedTriggers = webhookManager.getWebhookSupportedTriggers()
    const isSupported = supportedTriggers.some(trigger => trigger.type === triggerType)

    if (!isSupported) {
      return errorResponse("This trigger type does not support webhooks", 400, { supportedTriggers: supportedTriggers.map(t => t.type)
       })
    }

    // Get webhook URL for this workflow
    const webhookUrl = webhookManager.getWebhookUrl(workflowId, providerId)

    // Register the webhook
    logger.debug('🔧 About to call webhookManager.registerWebhook with:', {
      workflowId,
      userId: user.id,
      triggerType,
      providerId,
      config: config || {},
      webhookUrl
    })
    
    let webhookId
    try {
      webhookId = await webhookManager.registerWebhook({
        workflowId,
        userId: user.id,
        triggerType,
        providerId,
        config: config || {},
        webhookUrl
      })
      logger.debug('🎉 webhookManager.registerWebhook completed, webhookId:', webhookId)
    } catch (error) {
      logger.error('❌ Error in webhookManager.registerWebhook:', error)
      throw error
    }

    logger.debug(`✅ Webhook registered successfully:`, {
      workflowId,
      triggerType,
      providerId,
      webhookUrl,
      webhookId
    })

    const providerMessages: Record<string, string> = {
      gmail: "✉️ Gmail webhook registered successfully",
      discord: "🚨 Discord webhook registered successfully",
      slack: "💬 Slack webhook registered successfully",
      github: "🐙 GitHub webhook registered successfully",
      default: `✅ ${providerId} webhook registered successfully`
    }

    return jsonResponse({
      success: true,
      webhookId,
      webhookUrl,
      message: providerMessages[providerId] || providerMessages.default,
      provider: providerId,
      workflowId
    })

  } catch (error: any) {
    logger.error("Error registering webhook:", error)
    return errorResponse("Failed to register webhook", 500, { details: error.message 
     })
  }
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const { searchParams } = new URL(request.url)
    const webhookId = searchParams.get('webhookId')

    if (!webhookId) {
      return errorResponse("Missing webhookId parameter" , 400)
    }

    // Verify the webhook belongs to the user
    const { data: webhookConfig } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (!webhookConfig) {
      return errorResponse("Webhook not found or unauthorized" , 404)
    }

    // Unregister the webhook
    await webhookManager.unregisterWebhook(webhookId)

    return jsonResponse({
      success: true,
      message: "Webhook unregistered successfully"
    })

  } catch (error: any) {
    logger.error("Error unregistering webhook:", error)
    return errorResponse("Failed to unregister webhook", 500, { details: error.message 
     })
  }
}

export async function GET(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const { searchParams } = new URL(request.url)
    const webhookId = searchParams.get('webhookId')

    if (webhookId) {
      // Get specific webhook details
      const { data: webhookConfig } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('id', webhookId)
        .eq('user_id', user.id)
        .single()

      if (!webhookConfig) {
        return errorResponse("Webhook not found" , 404)
      }

      // Get recent executions
      const executions = await webhookManager.getWebhookExecutions(webhookId, 10)

      return jsonResponse({
        webhook: webhookConfig,
        executions
      })
    } 
      // Get all user's webhooks
      const webhooks = await webhookManager.getUserWebhooks(user.id)
      
      return jsonResponse({
        webhooks,
        supportedTriggers: webhookManager.getWebhookSupportedTriggers().map(t => ({
          type: t.type,
          title: t.title,
          description: t.description,
          providerId: t.providerId
        }))
      })
    

  } catch (error: any) {
    logger.error("Error fetching webhooks:", error)
    return errorResponse("Failed to fetch webhooks", 500, { details: error.message 
     })
  }
} 