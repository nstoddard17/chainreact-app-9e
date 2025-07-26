import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()
    
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    // Get all Notion integrations for this user
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'notion')
    
    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`🔍 Found ${integrations?.length || 0} Notion integrations for user ${userId}`)
    
    if (integrations && integrations.length > 0) {
      integrations.forEach((integration, index) => {
        console.log(`🔍 Integration ${index + 1}:`, {
          id: integration.id,
          status: integration.status,
          workspace_name: integration.metadata?.workspace_name,
          workspace_id: integration.metadata?.workspace_id,
          created_at: integration.created_at,
          updated_at: integration.updated_at
        })
      })
    }

    return NextResponse.json({
      userId,
      integrationCount: integrations?.length || 0,
      integrations: integrations?.map(integration => ({
        id: integration.id,
        status: integration.status,
        workspace_name: integration.metadata?.workspace_name,
        workspace_id: integration.metadata?.workspace_id,
        workspaces: integration.metadata?.workspaces,
        workspace_count: integration.metadata?.workspace_count,
        created_at: integration.created_at,
        updated_at: integration.updated_at,
        metadata: integration.metadata
      })) || []
    })
    
  } catch (error: any) {
    console.error('Debug Notion error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
} 