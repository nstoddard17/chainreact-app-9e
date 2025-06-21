import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { GDPRService } from "@/lib/compliance/gdprService"
import { ComplianceLogger } from "@/lib/security/complianceLogger"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

const gdprService = new GDPRService()
const complianceLogger = new ComplianceLogger()

export async function POST(request: NextRequest) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  try {
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { 
      deletionType = "full", // "full" | "partial" | "integration_specific"
      integrationProvider, // For partial deletions
      reason = "user_request",
      immediate = false // For immediate vs scheduled deletion
    } = await request.json()

    // Validate deletion type
    if (!["full", "partial", "integration_specific"].includes(deletionType)) {
      return NextResponse.json({ error: "Invalid deletion type" }, { status: 400 })
    }

    // Create deletion request record
    const deletionRequest = {
      user_id: user.id,
      deletion_type: deletionType,
      integration_provider: integrationProvider,
      reason,
      immediate,
      status: "pending",
      requested_at: new Date().toISOString(),
    }

    const { data: requestRecord, error: insertError } = await supabase
      .from("data_deletion_requests")
      .insert(deletionRequest)
      .select()
      .single()

    if (insertError) {
      console.error("Failed to create deletion request:", insertError)
      return NextResponse.json({ error: "Failed to create deletion request" }, { status: 500 })
    }

    // Log the deletion request
    await complianceLogger.logDataDeletion(user.id, "deletion_request", requestRecord.id, {
      deletion_type: deletionType,
      integration_provider: integrationProvider,
      reason,
      immediate,
    })

    // Process deletion based on type and timing
    if (immediate) {
      await processDeletion(user.id, deletionType, integrationProvider)
      
      // Update request status
      await supabase
        .from("data_deletion_requests")
        .update({ 
          status: "completed",
          completed_at: new Date().toISOString()
        })
        .eq("id", requestRecord.id)

      return NextResponse.json({ 
        success: true, 
        message: "Data deletion completed successfully",
        requestId: requestRecord.id
      })
    } else {
      // Schedule deletion for processing (within 30 days as per privacy policy)
      const scheduledDate = new Date()
      scheduledDate.setDate(scheduledDate.getDate() + 30)

      await supabase
        .from("data_deletion_requests")
        .update({ 
          scheduled_for: scheduledDate.toISOString(),
          status: "scheduled"
        })
        .eq("id", requestRecord.id)

      return NextResponse.json({ 
        success: true, 
        message: "Data deletion request received and scheduled for processing within 30 days",
        requestId: requestRecord.id,
        scheduledFor: scheduledDate.toISOString()
      })
    }

  } catch (error: any) {
    console.error("Data deletion error:", error)
    return NextResponse.json({ 
      error: "Failed to process deletion request",
      details: error.message 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get("requestId")

    if (requestId) {
      // Get specific deletion request
      const { data: deletionRequest, error } = await supabase
        .from("data_deletion_requests")
        .select("*")
        .eq("id", requestId)
        .eq("user_id", user.id)
        .single()

      if (error || !deletionRequest) {
        return NextResponse.json({ error: "Deletion request not found" }, { status: 404 })
      }

      return NextResponse.json({ deletionRequest })
    } else {
      // Get all deletion requests for user
      const { data: deletionRequests, error } = await supabase
        .from("data_deletion_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("requested_at", { ascending: false })

      if (error) {
        console.error("Failed to fetch deletion requests:", error)
        return NextResponse.json({ error: "Failed to fetch deletion requests" }, { status: 500 })
      }

      return NextResponse.json({ deletionRequests })
    }

  } catch (error: any) {
    console.error("Error fetching deletion requests:", error)
    return NextResponse.json({ 
      error: "Failed to fetch deletion requests",
      details: error.message 
    }, { status: 500 })
  }
}

async function processDeletion(userId: string, deletionType: string, integrationProvider?: string) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  try {
    switch (deletionType) {
      case "full":
        await performFullDeletion(userId)
        break
      
      case "partial":
        await performPartialDeletion(userId)
        break
      
      case "integration_specific":
        if (!integrationProvider) {
          throw new Error("Integration provider required for integration-specific deletion")
        }
        await performIntegrationSpecificDeletion(userId, integrationProvider)
        break
      
      default:
        throw new Error(`Unknown deletion type: ${deletionType}`)
    }

    // Log successful deletion
    await complianceLogger.logDataDeletion(userId, "data_deletion", userId, {
      deletion_type: deletionType,
      integration_provider: integrationProvider,
      status: "completed"
    })

  } catch (error) {
    console.error("Error processing deletion:", error)
    
    // Log failed deletion
    await complianceLogger.logDataDeletion(userId, "data_deletion", userId, {
      deletion_type: deletionType,
      integration_provider: integrationProvider,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error"
    })
    
    throw error
  }
}

async function performFullDeletion(userId: string) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  // Delete all user data
  const tablesToDelete = [
    "integrations",
    "workflows", 
    "workflow_executions",
    "execution_retries",
    "dead_letter_queue",
    "pkce_flow",
    "token_refresh_logs"
  ]

  for (const table of tablesToDelete) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("user_id", userId)

    if (error) {
      console.error(`Error deleting from ${table}:`, error)
      // Continue with other tables even if one fails
    }
  }

  // Anonymize audit logs (keep for compliance)
  await supabase
    .from("compliance_audit_logs")
    .update({
      user_id: null,
      ip_address: null,
      user_agent: "Anonymized per deletion request",
      old_values: null,
      new_values: null
    })
    .eq("user_id", userId)

  // Delete user account (this will cascade to other tables)
  const { error: userDeleteError } = await supabase.auth.admin.deleteUser(userId)
  
  if (userDeleteError) {
    console.error("Error deleting user account:", userDeleteError)
    throw new Error("Failed to delete user account")
  }
}

async function performPartialDeletion(userId: string) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  // Delete sensitive data but keep account
  const sensitiveTables = [
    "integrations",
    "workflow_executions",
    "execution_retries",
    "dead_letter_queue",
    "pkce_flow",
    "token_refresh_logs"
  ]

  for (const table of sensitiveTables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("user_id", userId)

    if (error) {
      console.error(`Error deleting from ${table}:`, error)
    }
  }

  // Anonymize workflows (keep structure but remove personal data)
  await supabase
    .from("workflows")
    .update({
      name: "Anonymized Workflow",
      description: "Data anonymized per deletion request",
      config: null
    })
    .eq("user_id", userId)
}

async function performIntegrationSpecificDeletion(userId: string, provider: string) {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()

  // Delete specific integration
  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider)

  if (error) {
    console.error(`Error deleting ${provider} integration:`, error)
    throw new Error(`Failed to delete ${provider} integration`)
  }

  // Delete related workflow executions that used this integration
  await supabase
    .from("workflow_executions")
    .delete()
    .eq("user_id", userId)
    .contains("execution_data", { integration_provider: provider })
} 