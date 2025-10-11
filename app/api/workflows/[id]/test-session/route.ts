import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

/**
 * Start a live test session for a workflow
 * Ensures webhook is registered and ready to receive events
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workflow details
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    // Find the trigger node
    const triggerNode = workflow.nodes?.find(
      (node: any) => node.data?.isTrigger === true
    )

    if (!triggerNode) {
      return NextResponse.json(
        { error: 'No trigger node found in workflow' },
        { status: 400 }
      )
    }

    const triggerType = triggerNode.data?.type

    // Check if this is a webhook-based trigger
    const webhookTriggers = [
      'gmail_trigger_new_email',
      'airtable_trigger_new_record',
      'airtable_trigger_record_updated',
      'github_trigger_new_issue',
      'github_trigger_pr_updated',
      'slack_trigger_new_message',
      'discord_trigger_new_message',
      'notion_trigger_page_updated',
      'trello_trigger_card_moved',
    ]

    if (!webhookTriggers.includes(triggerType)) {
      return NextResponse.json(
        {
          error: 'This trigger type does not support webhook-based live testing',
          triggerType,
        },
        { status: 400 }
      )
    }

    // Register webhook/trigger with external service (Gmail, Airtable, etc.)
    // This happens regardless of workflow status for live test mode
    const { triggerLifecycleManager } = await import('@/lib/triggers')

    console.log('🔄 Registering trigger for live test mode...')
    const result = await triggerLifecycleManager.activateWorkflowTriggers(
      workflowId,
      user.id,
      workflow.nodes || []
    )

    if (!result.success && result.errors.length > 0) {
      console.error('❌ Trigger activation failed:', result.errors)
      return NextResponse.json(
        {
          error: 'Failed to register webhook with external service',
          details: result.errors
        },
        { status: 500 }
      )
    }

    console.log('✅ Trigger registered successfully for live test mode')

    // Create test session record
    const sessionId = `test-${workflowId}-${Date.now()}`
    const { error: sessionError } = await supabase
      .from('workflow_test_sessions')
      .insert({
        id: sessionId,
        workflow_id: workflowId,
        user_id: user.id,
        status: 'listening',
        trigger_type: triggerType,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
      })

    if (sessionError) {
      console.error('Failed to create test session:', sessionError)
      // Continue anyway - this is not critical
    }

    return NextResponse.json({
      success: true,
      sessionId,
      status: 'listening',
      message: 'Webhook registered. Waiting for trigger event...',
      triggerType,
      expiresIn: 30 * 60 * 1000, // 30 minutes in ms
    })
  } catch (error: any) {
    console.error('Error starting test session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to start test session' },
      { status: 500 }
    )
  }
}

/**
 * Stop a live test session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workflow to get nodes for deactivation
    const { data: workflow } = await supabase
      .from('workflows')
      .select('nodes')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    // Unregister webhook/trigger from external service
    if (workflow?.nodes) {
      const { triggerLifecycleManager } = await import('@/lib/triggers')

      console.log('🔄 Deactivating trigger for live test mode...')
      await triggerLifecycleManager.deactivateWorkflowTriggers(workflowId, user.id)
      console.log('✅ Trigger deactivated successfully')
    }

    // Update test session to stopped
    await supabase
      .from('workflow_test_sessions')
      .update({
        status: 'stopped',
        ended_at: new Date().toISOString(),
      })
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .eq('status', 'listening')

    return NextResponse.json({
      success: true,
      message: 'Test session stopped and webhook unregistered',
    })
  } catch (error: any) {
    console.error('Error stopping test session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to stop test session' },
      { status: 500 }
    )
  }
}

/**
 * Get current test session status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get active test session
    const { data: session, error: sessionError } = await supabase
      .from('workflow_test_sessions')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .in('status', ['listening', 'executing'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sessionError) {
      console.error('Error fetching test session:', sessionError)
    }

    if (!session) {
      return NextResponse.json({
        active: false,
        session: null,
      })
    }

    // Check if session expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('workflow_test_sessions')
        .update({
          status: 'expired',
          ended_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      return NextResponse.json({
        active: false,
        session: { ...session, status: 'expired' },
      })
    }

    // If executing, get the execution details
    let executionDetails = null
    if (session.status === 'executing' && session.execution_id) {
      const { data: execution } = await supabase
        .from('executions')
        .select('*')
        .eq('id', session.execution_id)
        .single()

      executionDetails = execution
    }

    return NextResponse.json({
      active: true,
      session,
      execution: executionDetails,
    })
  } catch (error: any) {
    console.error('Error getting test session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get test session' },
      { status: 500 }
    )
  }
}
