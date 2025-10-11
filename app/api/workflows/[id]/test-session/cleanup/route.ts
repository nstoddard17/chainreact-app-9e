import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/utils/supabase/server'

/**
 * Cleanup endpoint for test sessions
 * Designed to work with navigator.sendBeacon (POST only)
 * Uses service role client to avoid cookie/auth issues during page unload
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params

    // Parse the request body
    let sessionId = null
    let userId = null

    try {
      const bodyText = await request.text()
      if (bodyText && bodyText.trim()) {
        const body = JSON.parse(bodyText)
        sessionId = body.sessionId
        userId = body.userId
      }
    } catch {
      // Invalid body, can't proceed
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    if (!sessionId || !userId) {
      return NextResponse.json({ error: 'Missing sessionId or userId' }, { status: 400 })
    }

    // Use service role client to avoid auth issues during page unload
    const supabase = await createSupabaseServiceClient()

    console.log(`🧹 Cleanup request received for session ${sessionId}`)

    // Verify session exists and belongs to this workflow
    const { data: session } = await supabase
      .from('workflow_test_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('workflow_id', workflowId)
      .eq('user_id', userId)
      .single()

    if (!session) {
      console.log('Session not found or already cleaned up')
      return NextResponse.json({ success: true })
    }

    // Get workflow to deactivate triggers
    const { data: workflow } = await supabase
      .from('workflows')
      .select('nodes')
      .eq('id', workflowId)
      .single()

    // Unregister webhook/trigger from external service
    if (workflow?.nodes) {
      try {
        const { triggerLifecycleManager } = await import('@/lib/triggers')
        console.log('🔄 Deactivating trigger for live test mode...')
        await triggerLifecycleManager.deactivateWorkflowTriggers(workflowId, userId)
        console.log('✅ Trigger deactivated successfully')
      } catch (error) {
        console.error('Error deactivating triggers:', error)
        // Continue with cleanup even if deactivation fails
      }
    }

    // Update test session to stopped
    await supabase
      .from('workflow_test_sessions')
      .update({
        status: 'stopped',
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    console.log(`✅ Test session ${sessionId} cleaned up successfully`)

    return NextResponse.json({
      success: true,
      message: 'Test session cleaned up',
    })
  } catch (error: any) {
    console.error('Error during cleanup:', error)
    // Don't fail during cleanup - best effort
    return NextResponse.json({ success: true })
  }
}