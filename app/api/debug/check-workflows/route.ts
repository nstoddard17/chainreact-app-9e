import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')

    // Get all workflows for the specific users
    const userIds = [
      'a3e3a51a-175c-4b59-ad03-227ba12a18b0',
      '66aea5b4-2b44-4db5-9a72-9d920fef154c'
    ]

    const { data: allWorkflows, error } = await supabase
      .from('workflows')
      .select('id, name, user_id, status, nodes, created_at, updated_at')
      .in('user_id', userId ? [userId] : userIds)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    // Analyze each workflow
    const workflowAnalysis = allWorkflows?.map(w => {
      let nodes: any[] = []
      let parseError = null
      let triggerNodes: any[] = []
      let oneDriveTriggers: any[] = []

      try {
        nodes = typeof w.nodes === 'string' ? JSON.parse(w.nodes) : w.nodes || []

        // Find trigger nodes
        triggerNodes = nodes.filter(n => n?.data?.isTrigger === true)

        // Find OneDrive triggers specifically
        oneDriveTriggers = nodes.filter(n => {
          const data = n?.data || {}
          const isOneDrive = (
            data.providerId === 'onedrive' ||
            data.type?.includes('onedrive') ||
            n.type?.includes('onedrive')
          )
          return data.isTrigger && isOneDrive
        })

      } catch (e: any) {
        parseError = e.message
      }

      return {
        id: w.id,
        name: w.name,
        userId: w.user_id,
        status: w.status,
        created: w.created_at,
        updated: w.updated_at,
        nodeCount: nodes.length,
        triggerCount: triggerNodes.length,
        oneDriveTriggerCount: oneDriveTriggers.length,
        triggers: triggerNodes.map(t => ({
          id: t.id,
          type: t.type,
          dataType: t.data?.type,
          providerId: t.data?.providerId,
          title: t.data?.title || t.data?.label,
          isTrigger: t.data?.isTrigger
        })),
        oneDriveTriggers: oneDriveTriggers.map(t => ({
          id: t.id,
          type: t.type,
          dataType: t.data?.type,
          config: t.data?.config,
          triggerConfig: t.data?.triggerConfig
        })),
        parseError
      }
    }) || []

    // Get all active workflows regardless of user
    const { data: activeWorkflows } = await supabase
      .from('workflows')
      .select('id, name, user_id, status')
      .eq('status', 'active')

    // Summary
    const summary = {
      totalWorkflowsFound: allWorkflows?.length || 0,
      totalActiveWorkflowsInDB: activeWorkflows?.length || 0,
      workflowsByStatus: {
        active: workflowAnalysis.filter(w => w.status === 'active').length,
        inactive: workflowAnalysis.filter(w => w.status === 'inactive').length,
        error: workflowAnalysis.filter(w => w.status === 'error').length,
        other: workflowAnalysis.filter(w => !['active', 'inactive', 'error'].includes(w.status)).length
      },
      workflowsWithTriggers: workflowAnalysis.filter(w => w.triggerCount > 0).length,
      workflowsWithOneDriveTriggers: workflowAnalysis.filter(w => w.oneDriveTriggerCount > 0).length,
      usersChecked: userId ? [userId] : userIds,
      activeWorkflowUserIds: [...new Set(activeWorkflows?.map(w => w.user_id))]
    }

    return NextResponse.json({
      summary,
      workflows: workflowAnalysis,
      recommendation: workflowAnalysis.filter(w => w.oneDriveTriggerCount > 0).length === 0
        ? "No workflows with OneDrive triggers found. User needs to create a workflow with a OneDrive trigger or activate existing workflows."
        : workflowAnalysis.filter(w => w.oneDriveTriggerCount > 0 && w.status === 'active').length === 0
        ? "OneDrive workflows exist but are not active. User needs to activate their workflows."
        : "Active OneDrive workflows found. Check if trigger nodes have proper type field set."
    })

  } catch (error) {
    console.error('Error checking workflows:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}