import { NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/utils/logger"

export const dynamic = "force-dynamic"

/**
 * Cleanup endpoint to remove duplicate/old integrations
 *
 * When users reconnect an integration, a new record is created but the old one remains.
 * This endpoint finds and deletes old integration records for each user+provider combo,
 * keeping only the most recent one.
 *
 * Usage: POST /api/debug/cleanup-duplicate-integrations?secret=YOUR_SECRET
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")
  const dryRun = searchParams.get("dryRun") === "true"

  // Require authentication
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getAdminSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
  }

  try {
    // Get all integrations
    const { data: allIntegrations, error: fetchError } = await supabase
      .from("integrations")
      .select("id, user_id, provider, status, created_at, updated_at")
      .order("created_at", { ascending: false })

    if (fetchError) {
      logger.error("Error fetching integrations:", fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!allIntegrations || allIntegrations.length === 0) {
      return NextResponse.json({
        message: "No integrations found",
        duplicatesRemoved: 0
      })
    }

    // Group by user_id + provider to find duplicates
    const grouped = new Map<string, typeof allIntegrations>()

    for (const integration of allIntegrations) {
      const key = `${integration.user_id}:${integration.provider}`
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(integration)
    }

    // Find duplicates (more than 1 integration per user+provider)
    const duplicateGroups = Array.from(grouped.entries())
      .filter(([_, integrations]) => integrations.length > 1)

    logger.debug(`Found ${duplicateGroups.length} user+provider combinations with duplicates`)

    const toDelete: string[] = []
    const summary: Array<{ user_id: string; provider: string; kept: string; deleted: string[] }> = []

    for (const [key, integrations] of duplicateGroups) {
      // Sort by created_at descending (newest first)
      const sorted = integrations.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      // Keep the most recent one, delete the rest
      const [keep, ...deleteList] = sorted

      toDelete.push(...deleteList.map(i => i.id))

      summary.push({
        user_id: key.split(':')[0].substring(0, 8) + "...",
        provider: key.split(':')[1],
        kept: keep.id,
        deleted: deleteList.map(i => i.id)
      })

      logger.debug(`${key}: Keeping ${keep.id} (created ${keep.created_at}), deleting ${deleteList.length} older record(s)`)
    }

    if (dryRun) {
      return NextResponse.json({
        message: "Dry run - no changes made",
        duplicateGroupsFound: duplicateGroups.length,
        integrationsToDelete: toDelete.length,
        summary
      })
    }

    // Delete old duplicates
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("integrations")
        .delete()
        .in("id", toDelete)

      if (deleteError) {
        logger.error("Error deleting duplicates:", deleteError)
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
      }

      logger.debug(`Successfully deleted ${toDelete.length} duplicate integration(s)`)
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${toDelete.length} duplicate integration(s)`,
      duplicateGroupsFound: duplicateGroups.length,
      integrationsDeleted: toDelete.length,
      summary
    })

  } catch (error: any) {
    logger.error("Error during cleanup:", error)
    return NextResponse.json({
      error: "Failed to cleanup duplicates",
      details: error.message
    }, { status: 500 })
  }
}
