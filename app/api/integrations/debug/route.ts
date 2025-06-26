import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  try {
    console.log("Debug endpoint called")

    const supabase = getSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
    }
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: integrations, error } = await supabase.from("integrations").select("*").eq("user_id", user.id)

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Count integrations by provider and status instead of returning all details
    const byProvider = {};
    const byStatus = {};
    
    integrations?.forEach(integration => {
      // Count by provider
      byProvider[integration.provider] = (byProvider[integration.provider] || 0) + 1;
      
      // Count by status
      byStatus[integration.status || 'unknown'] = (byStatus[integration.status || 'unknown'] || 0) + 1; 
    });

    return NextResponse.json({
      success: true,
      count: integrations?.length || 0,
      byProvider,
      byStatus
    })
  } catch (error: any) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
