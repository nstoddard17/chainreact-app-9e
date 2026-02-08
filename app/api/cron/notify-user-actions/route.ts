/**
 * User Action Notification Cron Job
 *
 * Sends escalating notifications for integrations requiring user action.
 * Implements a progressive notification strategy to ensure users are aware
 * of issues without overwhelming them.
 *
 * Schedule: Every hour
 *
 * Notification Escalation:
 * - Day 0: In-app notification (when issue first detected)
 * - Day 2: In-app + email notification
 * - Day 5: Urgent email (48 hours until pause)
 * - Day 7: Pause workflows, final notice
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendDisconnectionNotification, sendWarningNotification } from "@/lib/integrations/notificationService"
import { logger } from "@/lib/utils/logger"

// Notification escalation thresholds (in hours from deadline)
const ESCALATION_THRESHOLDS = {
  FIRST_WARNING: 168, // 7 days before deadline (Day 0)
  SECOND_WARNING: 120, // 5 days before deadline (Day 2)
  URGENT_WARNING: 48, // 2 days before deadline (Day 5)
  FINAL_WARNING: 6, // 6 hours before deadline
  DEADLINE_PASSED: 0, // Deadline has passed
}

// Maximum integrations to process per run
const MAX_INTEGRATIONS_PER_RUN = 100

export const maxDuration = 60 // 60 second timeout for Vercel

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Verify cron secret for Vercel cron jobs
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const stats = {
    processed: 0,
    notified: 0,
    workflowsPaused: 0,
    skipped: 0,
    errors: [] as string[],
  }

  try {
    logger.info("[UserActionNotify] Starting user action notification job")

    const supabase = createAdminClient()
    if (!supabase) {
      throw new Error("Failed to create Supabase client")
    }

    const now = new Date()

    // Query integrations requiring user action
    const { data: integrations, error: queryError } = await supabase
      .from("integrations")
      .select(`
        id,
        user_id,
        provider,
        status,
        requires_user_action,
        user_action_type,
        user_action_deadline,
        user_action_notified_at,
        last_error_code,
        last_error_details,
        consecutive_failures
      `)
      .eq("requires_user_action", true)
      .not("user_action_deadline", "is", null)
      .order("user_action_deadline", { ascending: true })
      .limit(MAX_INTEGRATIONS_PER_RUN)

    if (queryError) {
      throw new Error(`Failed to query integrations: ${queryError.message}`)
    }

    if (!integrations || integrations.length === 0) {
      logger.info("[UserActionNotify] No integrations require user action notifications")
      return NextResponse.json({
        success: true,
        message: "No integrations require notifications",
        stats,
        durationMs: Date.now() - startTime,
      })
    }

    logger.info(`[UserActionNotify] Found ${integrations.length} integrations requiring attention`)

    // Process each integration
    for (const integration of integrations) {
      stats.processed++

      try {
        const deadline = new Date(integration.user_action_deadline)
        const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)
        const lastNotified = integration.user_action_notified_at
          ? new Date(integration.user_action_notified_at)
          : null

        // Determine notification level
        const notificationLevel = getNotificationLevel(hoursUntilDeadline)

        // Skip if we've already notified at this level recently
        if (shouldSkipNotification(lastNotified, notificationLevel, now)) {
          stats.skipped++
          logger.debug(
            `[UserActionNotify] Skipping ${integration.provider} - already notified at this level`
          )
          continue
        }

        logger.info(
          `[UserActionNotify] Processing ${integration.provider} - ${hoursUntilDeadline.toFixed(1)} hours until deadline, level: ${notificationLevel}`
        )

        // Handle based on notification level
        switch (notificationLevel) {
          case "deadline_passed":
            // Pause workflows and send final notice
            await handleDeadlinePassed(supabase, integration)
            stats.workflowsPaused++
            stats.notified++
            break

          case "final_warning":
            // Send urgent final warning
            await sendFinalWarning(supabase, integration, hoursUntilDeadline)
            stats.notified++
            break

          case "urgent_warning":
            // Send urgent email warning
            await sendUrgentWarning(supabase, integration, hoursUntilDeadline)
            stats.notified++
            break

          case "second_warning":
            // Send second warning (in-app + email)
            await sendSecondWarning(supabase, integration)
            stats.notified++
            break

          case "first_warning":
            // Send first warning (in-app only)
            await sendFirstWarning(supabase, integration)
            stats.notified++
            break

          default:
            stats.skipped++
        }

        // Update last notified timestamp
        await supabase
          .from("integrations")
          .update({
            user_action_notified_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", integration.id)
      } catch (error) {
        stats.errors.push(
          `${integration.provider}: ${error instanceof Error ? error.message : "Unknown error"}`
        )
        logger.error(`[UserActionNotify] Error processing integration ${integration.id}:`, error)
      }
    }

    const durationMs = Date.now() - startTime

    logger.info("[UserActionNotify] Completed", {
      ...stats,
      durationMs,
    })

    return NextResponse.json({
      success: true,
      stats,
      durationMs,
    })
  } catch (error) {
    logger.error("[UserActionNotify] Job failed:", error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stats,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

/**
 * Get the notification level based on hours until deadline
 */
function getNotificationLevel(
  hoursUntilDeadline: number
): "deadline_passed" | "final_warning" | "urgent_warning" | "second_warning" | "first_warning" | "none" {
  if (hoursUntilDeadline <= ESCALATION_THRESHOLDS.DEADLINE_PASSED) {
    return "deadline_passed"
  }
  if (hoursUntilDeadline <= ESCALATION_THRESHOLDS.FINAL_WARNING) {
    return "final_warning"
  }
  if (hoursUntilDeadline <= ESCALATION_THRESHOLDS.URGENT_WARNING) {
    return "urgent_warning"
  }
  if (hoursUntilDeadline <= ESCALATION_THRESHOLDS.SECOND_WARNING) {
    return "second_warning"
  }
  if (hoursUntilDeadline <= ESCALATION_THRESHOLDS.FIRST_WARNING) {
    return "first_warning"
  }
  return "none"
}

/**
 * Determine if we should skip notification (avoid spamming)
 */
function shouldSkipNotification(
  lastNotified: Date | null,
  level: string,
  now: Date
): boolean {
  if (!lastNotified) {
    return false // Never notified, should send
  }

  const hoursSinceLastNotification = (now.getTime() - lastNotified.getTime()) / (1000 * 60 * 60)

  // Different cooldown periods based on urgency
  switch (level) {
    case "deadline_passed":
      return false // Always notify when deadline passed
    case "final_warning":
      return hoursSinceLastNotification < 2 // Every 2 hours when critical
    case "urgent_warning":
      return hoursSinceLastNotification < 12 // Every 12 hours when urgent
    case "second_warning":
      return hoursSinceLastNotification < 24 // Once per day
    case "first_warning":
      return hoursSinceLastNotification < 48 // Once every 2 days
    default:
      return true
  }
}

/**
 * Send first warning (in-app only, Day 0)
 */
async function sendFirstWarning(
  supabase: ReturnType<typeof createAdminClient>,
  integration: { id: string; user_id: string; provider: string; last_error_code: string | null }
): Promise<void> {
  logger.info(`[UserActionNotify] Sending first warning for ${integration.provider}`)

  await sendWarningNotification(supabase, {
    userId: integration.user_id,
    provider: integration.provider,
    integrationId: integration.id,
    notificationType: "warning",
    consecutiveFailures: 1,
    errorMessage: getErrorMessage(integration.last_error_code),
  })
}

/**
 * Send second warning (in-app + email, Day 2)
 */
async function sendSecondWarning(
  supabase: ReturnType<typeof createAdminClient>,
  integration: { id: string; user_id: string; provider: string; last_error_code: string | null }
): Promise<void> {
  logger.info(`[UserActionNotify] Sending second warning for ${integration.provider}`)

  await sendDisconnectionNotification(supabase, {
    userId: integration.user_id,
    provider: integration.provider,
    integrationId: integration.id,
    notificationType: "disconnected",
    consecutiveFailures: 2,
    errorMessage: getErrorMessage(integration.last_error_code),
    sendEmail: true,
  })
}

/**
 * Send urgent warning (Day 5 - 48 hours until pause)
 */
async function sendUrgentWarning(
  supabase: ReturnType<typeof createAdminClient>,
  integration: { id: string; user_id: string; provider: string; last_error_code: string | null },
  hoursUntilDeadline: number
): Promise<void> {
  logger.info(`[UserActionNotify] Sending urgent warning for ${integration.provider}`)

  const providerName = getProviderDisplayName(integration.provider)

  // Create urgent in-app notification
  await supabase.from("notifications").insert({
    user_id: integration.user_id,
    type: "integration_urgent",
    title: `Urgent: ${providerName} will be paused in ${Math.ceil(hoursUntilDeadline)} hours`,
    message: `Your ${providerName} connection needs immediate attention. Workflows using this integration will be paused if not reconnected.`,
    action_url: `/integrations?reconnect=${integration.provider}`,
    action_label: "Reconnect Now",
    metadata: {
      provider: integration.provider,
      integration_id: integration.id,
      hours_until_deadline: hoursUntilDeadline,
      severity: "urgent",
    },
    is_read: false,
    created_at: new Date().toISOString(),
  })

  // Send urgent email
  await sendDisconnectionNotification(supabase, {
    userId: integration.user_id,
    provider: integration.provider,
    integrationId: integration.id,
    notificationType: "disconnected",
    consecutiveFailures: 3,
    errorMessage: `Action required within ${Math.ceil(hoursUntilDeadline)} hours to prevent workflow pause.`,
    sendEmail: true,
  })
}

/**
 * Send final warning (6 hours before deadline)
 */
async function sendFinalWarning(
  supabase: ReturnType<typeof createAdminClient>,
  integration: { id: string; user_id: string; provider: string; last_error_code: string | null },
  hoursUntilDeadline: number
): Promise<void> {
  logger.info(`[UserActionNotify] Sending final warning for ${integration.provider}`)

  const providerName = getProviderDisplayName(integration.provider)

  // Create critical in-app notification
  await supabase.from("notifications").insert({
    user_id: integration.user_id,
    type: "integration_critical",
    title: `Critical: ${providerName} workflows pausing in ${Math.ceil(hoursUntilDeadline)} hours`,
    message: `This is your final notice. Your ${providerName} workflows will be automatically paused unless you reconnect immediately.`,
    action_url: `/integrations?reconnect=${integration.provider}`,
    action_label: "Reconnect Immediately",
    metadata: {
      provider: integration.provider,
      integration_id: integration.id,
      hours_until_deadline: hoursUntilDeadline,
      severity: "critical",
    },
    is_read: false,
    created_at: new Date().toISOString(),
  })
}

/**
 * Handle deadline passed - pause workflows
 */
async function handleDeadlinePassed(
  supabase: ReturnType<typeof createAdminClient>,
  integration: { id: string; user_id: string; provider: string }
): Promise<void> {
  logger.warn(`[UserActionNotify] Deadline passed for ${integration.provider} - pausing workflows`)

  const providerName = getProviderDisplayName(integration.provider)

  // Update integration status
  await supabase
    .from("integrations")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id)

  // Find and pause workflows using this integration
  // First, get nodes that use this provider
  const { data: workflows } = await supabase
    .from("workflows")
    .select("id, name, user_id, is_active")
    .eq("user_id", integration.user_id)
    .eq("is_active", true)

  if (workflows && workflows.length > 0) {
    // Check each workflow for nodes using this provider
    for (const workflow of workflows) {
      const { data: nodes } = await supabase
        .from("nodes")
        .select("id, provider")
        .eq("workflow_id", workflow.id)
        .ilike("provider", `%${integration.provider}%`)

      if (nodes && nodes.length > 0) {
        // Pause this workflow
        await supabase
          .from("workflows")
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", workflow.id)

        logger.info(`[UserActionNotify] Paused workflow ${workflow.id} due to ${integration.provider} deadline`)
      }
    }
  }

  // Create final notification
  await supabase.from("notifications").insert({
    user_id: integration.user_id,
    type: "integration_paused",
    title: `${providerName} workflows paused`,
    message: `Your ${providerName} connection has expired and related workflows have been paused. Reconnect to resume your workflows.`,
    action_url: `/integrations?reconnect=${integration.provider}`,
    action_label: "Reconnect to Resume",
    metadata: {
      provider: integration.provider,
      integration_id: integration.id,
      severity: "critical",
    },
    is_read: false,
    created_at: new Date().toISOString(),
  })

  // Send final email
  await sendDisconnectionNotification(supabase, {
    userId: integration.user_id,
    provider: integration.provider,
    integrationId: integration.id,
    notificationType: "disconnected",
    consecutiveFailures: 5,
    errorMessage: "Workflows have been paused. Reconnect to resume.",
    sendEmail: true,
  })
}

/**
 * Get human-readable error message from error code
 */
function getErrorMessage(errorCode: string | null): string {
  if (!errorCode) {
    return "Connection issue detected"
  }

  const errorMessages: Record<string, string> = {
    invalid_grant: "Your authorization has expired",
    revoked: "You revoked access to this app",
    scope_changed: "Permission settings have changed",
    rate_limited: "Too many requests",
    network_error: "Network connection issue",
    server_error: "Service temporarily unavailable",
    unauthorized: "Authentication failed",
    forbidden: "Access denied",
  }

  return errorMessages[errorCode] || "Connection issue detected"
}

/**
 * Get provider display name
 */
function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    hubspot: "HubSpot",
    "google-sheets": "Google Sheets",
    "google-drive": "Google Drive",
    "google-calendar": "Google Calendar",
    "microsoft-outlook": "Microsoft Outlook",
    outlook: "Outlook",
    onedrive: "OneDrive",
    gmail: "Gmail",
    slack: "Slack",
    discord: "Discord",
    trello: "Trello",
    notion: "Notion",
    airtable: "Airtable",
    stripe: "Stripe",
    github: "GitHub",
    teams: "Microsoft Teams",
    "microsoft-teams": "Microsoft Teams",
  }

  return displayNames[provider.toLowerCase()] || provider.charAt(0).toUpperCase() + provider.slice(1)
}
