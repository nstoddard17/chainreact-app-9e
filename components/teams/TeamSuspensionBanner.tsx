"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Clock, XCircle } from "lucide-react"
import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { logger } from "@/lib/utils/logger"

interface TeamSuspensionBannerProps {
  teamId?: string
  userId?: string
}

interface Team {
  id: string
  name: string
  suspended_at: string | null
  suspension_reason: string | null
  grace_period_ends_at: string | null
}

/**
 * TeamSuspensionBanner - Shows warning banners for teams in grace period or suspended
 *
 * Usage:
 * - In team pages: <TeamSuspensionBanner teamId={team.id} />
 * - In dashboard: <TeamSuspensionBanner userId={user.id} /> (shows all user's teams)
 */
export function TeamSuspensionBanner({ teamId, userId }: TeamSuspensionBannerProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTeamsStatus()
  }, [teamId, userId])

  const loadTeamsStatus = async () => {
    try {
      const supabase = createClient()

      let query = supabase
        .from("teams")
        .select("id, name, suspended_at, suspension_reason, grace_period_ends_at")

      // Filter by specific team or user's teams
      if (teamId) {
        query = query.eq("id", teamId)
      } else if (userId) {
        query = query.eq("created_by", userId)
      } else {
        // No filter provided, don't load anything
        setLoading(false)
        return
      }

      // Only show teams that are suspended or in grace period
      query = query.or("suspended_at.not.is.null,grace_period_ends_at.not.is.null")

      const { data, error } = await query

      if (error) {
        logger.error("Failed to load team suspension status:", error)
        setLoading(false)
        return
      }

      setTeams(data || [])
    } catch (error) {
      logger.error("Error loading team suspension status:", error)
    } finally {
      setLoading(false)
    }
  }

  const getDaysRemaining = (gracePeriodEndsAt: string): number => {
    const endDate = new Date(gracePeriodEndsAt)
    const now = new Date()
    const diffMs = endDate.getTime() - now.getTime()
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  }

  const getSuspensionReasonText = (reason: string | null): string => {
    switch (reason) {
      case "owner_downgraded":
        return "the team owner's subscription was downgraded"
      case "payment_failed":
        return "payment failed"
      case "quota_exceeded":
        return "quota was exceeded"
      case "manual_suspension":
        return "manual suspension by admin"
      default:
        return "unknown reason"
    }
  }

  if (loading || teams.length === 0) {
    return null
  }

  return (
    <div className="space-y-3 mb-6">
      {teams.map((team) => {
        // Suspended teams
        if (team.suspended_at) {
          return (
            <Alert key={team.id} variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-950/20">
              <XCircle className="h-5 w-5" />
              <AlertTitle className="text-lg font-semibold">
                Team Suspended: {team.name}
              </AlertTitle>
              <AlertDescription className="mt-2 space-y-3">
                <p>
                  This team has been suspended because {getSuspensionReasonText(team.suspension_reason)}.
                  All workflows in this team have been disabled.
                </p>
                <p className="text-sm">
                  Workflows have been moved to the team creator's root folder and can be accessed there.
                </p>
                <div className="flex gap-3 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.href = "/settings/billing"}
                    className="border-red-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    Upgrade to Reactivate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = "/workflows"}
                  >
                    View Workflows
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )
        }

        // Teams in grace period
        if (team.grace_period_ends_at && !team.suspended_at) {
          const daysRemaining = getDaysRemaining(team.grace_period_ends_at)
          const isUrgent = daysRemaining <= 2

          return (
            <Alert
              key={team.id}
              variant={isUrgent ? "destructive" : "default"}
              className={isUrgent ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20" : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20"}
            >
              {isUrgent ? (
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              ) : (
                <Clock className="h-5 w-5 text-yellow-600" />
              )}
              <AlertTitle className="text-lg font-semibold">
                {isUrgent ? "⚠️ Urgent" : "⏰ Grace Period"}: {team.name}
              </AlertTitle>
              <AlertDescription className="mt-2 space-y-3">
                <p>
                  This team will be suspended in <strong>{daysRemaining} {daysRemaining === 1 ? "day" : "days"}</strong> because {getSuspensionReasonText(team.suspension_reason)}.
                </p>
                <p className="text-sm">
                  {daysRemaining > 0 ? (
                    <>
                      You have until <strong>{new Date(team.grace_period_ends_at).toLocaleDateString()}</strong> to upgrade your account to keep this team active.
                    </>
                  ) : (
                    <>
                      Your grace period has expired. The team will be suspended soon.
                    </>
                  )}
                </p>
                <div className="flex gap-3 mt-4">
                  <Button
                    size="sm"
                    onClick={() => window.location.href = "/settings/billing"}
                    className={isUrgent ? "bg-orange-600 hover:bg-orange-700" : "bg-yellow-600 hover:bg-yellow-700"}
                  >
                    Upgrade Now
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.href = `/teams/${team.id}`}
                  >
                    View Team Details
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )
        }

        return null
      })}
    </div>
  )
}
