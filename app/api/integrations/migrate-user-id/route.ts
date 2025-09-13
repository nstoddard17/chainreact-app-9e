import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

export const dynamic = 'force-dynamic'

/**
 * API endpoint to migrate integrations from old user IDs to current user ID
 * This handles cases where a user's auth ID has changed but integrations remain
 * linked to their old ID
 */
export async function POST() {
  try {
    // Get the current authenticated user
    const supabaseAuth = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated", userError }, { status: 401 })
    }

    const currentUserId = user.id
    const userEmail = user.email

    // Use service role to bypass RLS
    const supabaseService = await createSupabaseServiceClient()
    
    // Find integrations that might belong to this user based on email patterns
    // or other metadata but have different user_ids
    const { data: orphanedIntegrations, error: searchError } = await supabaseService
      .from("integrations")
      .select("*")
      .neq("user_id", currentUserId)
    
    if (searchError) {
      console.error("Error searching for orphaned integrations:", searchError)
      return NextResponse.json({ 
        error: "Failed to search for orphaned integrations",
        details: searchError.message 
      }, { status: 500 })
    }

    // Filter integrations that likely belong to this user
    // This is a conservative approach - you might want to add more sophisticated matching
    const integrationsToMigrate = orphanedIntegrations?.filter(integration => {
      // Check if metadata contains user email or similar identifying info
      const metadata = integration.metadata as any
      if (metadata?.userEmail === userEmail) return true
      if (metadata?.email === userEmail) return true
      
      // Add more matching criteria as needed
      return false
    }) || []

    if (integrationsToMigrate.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No orphaned integrations found",
        migrated: 0
      })
    }

    // Migrate the integrations
    const migrationPromises = integrationsToMigrate.map(integration =>
      supabaseService
        .from("integrations")
        .update({ 
          user_id: currentUserId,
          updated_at: new Date().toISOString()
        })
        .eq("id", integration.id)
    )

    const results = await Promise.allSettled(migrationPromises)
    const successCount = results.filter(r => r.status === "fulfilled").length
    const failureCount = results.filter(r => r.status === "rejected").length

    return NextResponse.json({
      success: true,
      message: `Migration completed`,
      migrated: successCount,
      failed: failureCount,
      details: {
        currentUserId,
        userEmail,
        integrationsFound: integrationsToMigrate.length
      }
    })
    
  } catch (error: any) {
    console.error("Migration error:", error)
    return NextResponse.json({ 
      error: "Migration failed",
      message: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}