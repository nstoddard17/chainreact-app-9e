import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    // Get all workflows with Discord triggers
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select('*')
      .in('status', ['draft', 'active'])

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter for Discord triggers and show their configuration
    const discordWorkflows = workflows?.map(workflow => {
      const nodes = workflow.nodes || []
      const discordTriggers = nodes.filter((node: any) =>
        node.data?.providerId === 'discord' &&
        node.data?.isTrigger === true
      )

      if (discordTriggers.length === 0) return null

      return {
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: workflow.status,
        triggers: discordTriggers.map((trigger: any) => ({
          nodeId: trigger.id,
          type: trigger.data?.type,
          configuredChannelId: trigger.data?.config?.channelId || 'NOT_CONFIGURED',
          configuredGuildId: trigger.data?.config?.guildId || 'NOT_CONFIGURED',
          hasConfig: !!trigger.data?.config,
          allConfigKeys: trigger.data?.config ? Object.keys(trigger.data.config) : []
        }))
      }
    }).filter(Boolean)

    return NextResponse.json({
      totalWorkflows: workflows?.length || 0,
      discordWorkflows: discordWorkflows,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}