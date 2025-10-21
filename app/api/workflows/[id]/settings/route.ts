import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

/**
 * GET /api/workflows/[id]/settings
 * Get workflow settings
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { id: workflowId } = await params

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // Fetch workflow settings
    const { data: workflow, error } = await supabase
      .from('workflows')
      .select('id, name, description, settings')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      logger.error('Error fetching workflow settings:', error)
      return errorResponse('Failed to fetch settings', 500)
    }

    if (!workflow) {
      return errorResponse('Workflow not found', 404)
    }

    // Merge default settings with saved settings
    const defaultSettings = {
      error_notifications_enabled: false,
      error_notification_email: false,
      error_notification_slack: false,
      error_notification_discord: false,
      error_notification_sms: false,
      error_notification_channels: {},
      auto_retry_enabled: false,
      max_retries: 3,
      retry_strategy: 'exponential',
      timeout_seconds: 300,
      concurrent_execution_limit: undefined,
    }

    const settings = {
      ...defaultSettings,
      ...workflow.settings,
      name: workflow.name,
      description: workflow.description,
    }

    return jsonResponse({
      success: true,
      settings
    })
  } catch (error) {
    logger.error('Error in workflow settings GET API:', error)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * PUT /api/workflows/[id]/settings
 * Update workflow settings
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { id: workflowId } = await params

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const {
      name,
      description,
      error_notifications_enabled,
      error_notification_email,
      error_notification_slack,
      error_notification_discord,
      error_notification_sms,
      error_notification_channels,
      auto_retry_enabled,
      max_retries,
      retry_strategy,
      timeout_seconds,
      concurrent_execution_limit,
    } = body

    // Prepare settings object (exclude name and description)
    const settings = {
      error_notifications_enabled,
      error_notification_email,
      error_notification_slack,
      error_notification_discord,
      error_notification_sms,
      error_notification_channels,
      auto_retry_enabled,
      max_retries,
      retry_strategy,
      timeout_seconds,
      concurrent_execution_limit,
    }

    // Update workflow
    const { data, error } = await supabase
      .from('workflows')
      .update({
        name,
        description,
        settings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      logger.error('Error updating workflow settings:', error)
      return errorResponse('Failed to update settings', 500)
    }

    if (!data) {
      return errorResponse('Workflow not found', 404)
    }

    return jsonResponse({
      success: true,
      workflow: data
    })
  } catch (error) {
    logger.error('Error in workflow settings PUT API:', error)
    return errorResponse('Internal server error', 500)
  }
}
