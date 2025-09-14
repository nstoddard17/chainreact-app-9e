import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

export const dynamic = 'force-dynamic'

/**
 * Checks if there are any orphaned integrations for the current user
 * This is a lightweight check that doesn't actually migrate data
 */
export async function POST() {
  try {
    const supabaseAuth = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Quick check: Do we have any integrations with the current user ID?
    const { count: currentCount } = await supabaseAuth
      .from("integrations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)

    // If user has integrations with current ID, likely no orphaned ones
    if (currentCount && currentCount > 0) {
      return NextResponse.json({
        hasOrphaned: false,
        currentCount
      })
    }

    // If no integrations with current ID, check if there might be orphaned ones
    // This requires service role to check other user IDs
    const supabaseService = await createSupabaseServiceClient()
    
    // Get user's email for matching
    const userEmail = user.email
    
    if (!userEmail) {
      return NextResponse.json({
        hasOrphaned: false,
        reason: "No email to match against"
      })
    }

    // Check if there are ANY integrations in the system that might belong to this user
    // We'll check user_profiles table to find any old user IDs for this email
    const { data: userProfiles } = await supabaseService
      .from("user_profiles")
      .select("id")
      .eq("email", userEmail)
      .neq("id", user.id)

    if (!userProfiles || userProfiles.length === 0) {
      return NextResponse.json({
        hasOrphaned: false,
        reason: "No alternate user profiles found"
      })
    }

    // Check if any of these old user IDs have integrations
    const oldUserIds = userProfiles.map(p => p.id)
    const { count: orphanedCount } = await supabaseService
      .from("integrations")
      .select("*", { count: "exact", head: true })
      .in("user_id", oldUserIds)

    return NextResponse.json({
      hasOrphaned: orphanedCount > 0,
      orphanedCount,
      currentCount: currentCount || 0
    })
    
  } catch (error: any) {
    console.error("Check orphaned error:", error)
    // Don't fail the check, just return false
    return NextResponse.json({
      hasOrphaned: false,
      error: error.message
    })
  }
}