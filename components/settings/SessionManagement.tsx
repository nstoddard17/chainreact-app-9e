"use client"

import { useState, useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Shield,
  LogOut,
  Clock,
  MapPin,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

interface Session {
  id: string
  user_agent: string
  ip_address: string
  created_at: string
  last_sign_in_at?: string
  expires_at?: string | null
  is_current: boolean
  revoked_at?: string | null
  location?: string
}

interface SessionManagementProps {
  className?: string
}

/**
 * Session Management Component
 * Displays active sessions and allows users to revoke them
 */
export function SessionManagement({ className }: SessionManagementProps) {
  const router = useRouter()
  const { user, signOut } = useAuthStore()
  const { toast } = useToast()
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)

  // Fetch sessions
  useEffect(() => {
    if (!user) return

    const fetchSessions = async () => {
      try {
        const response = await fetch("/api/sessions")
        if (response.ok) {
          const data = await response.json()
          setSessions(data.sessions || [])
          setCurrentSession(data.current || null)
        }
      } catch (error) {
        console.error("Failed to fetch sessions:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchSessions()
  }, [user])

  // Revoke a session
  const revokeSession = async (sessionId: string) => {
    setRevoking(sessionId)
    try {
      const response = await fetch(`/api/sessions?sessionId=${sessionId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        toast({
          title: "Session Revoked",
          description: "The session has been signed out.",
        })
      } else {
        throw new Error("Failed to revoke session")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to revoke session. Please try again.",
        variant: "destructive",
      })
    } finally {
      setRevoking(null)
    }
  }

  // Revoke all other sessions
  const revokeAllSessions = async () => {
    try {
      const response = await fetch("/api/sessions?all=true", {
        method: "DELETE",
      })

      if (response.ok) {
        // This will sign out the user from all devices
        signOut()
        router.push("/")
        toast({
          title: "All Sessions Revoked",
          description: "You have been signed out from all devices.",
        })
      } else {
        throw new Error("Failed to revoke sessions")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to revoke sessions. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Parse user agent to get device info
  const parseUserAgent = (ua: string): {
    device: "desktop" | "mobile" | "tablet" | "unknown"
    browser: string
    os: string
  } => {
    const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua)

    let device: "desktop" | "mobile" | "tablet" | "unknown" = "desktop"
    if (isTablet) device = "tablet"
    else if (isMobile) device = "mobile"

    // Parse browser
    let browser = "Unknown Browser"
    if (ua.includes("Chrome")) browser = "Chrome"
    else if (ua.includes("Safari")) browser = "Safari"
    else if (ua.includes("Firefox")) browser = "Firefox"
    else if (ua.includes("Edge")) browser = "Edge"
    else if (ua.includes("Opera")) browser = "Opera"

    // Parse OS
    let os = "Unknown OS"
    if (ua.includes("Windows")) os = "Windows"
    else if (ua.includes("Mac")) os = "macOS"
    else if (ua.includes("Linux")) os = "Linux"
    else if (ua.includes("Android")) os = "Android"
    else if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) os = "iOS"

    return { device, browser, os }
  }

  const getDeviceIcon = (device: string) => {
    switch (device) {
      case "mobile":
        return Smartphone
      case "tablet":
        return Tablet
      default:
        return Monitor
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Current Session */}
      {currentSession && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Current Session</CardTitle>
                  <CardDescription>This device</CardDescription>
                </div>
              </div>
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                <CheckCircle className="w-3 h-3 mr-1" />
                Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <SessionCard session={currentSession} isCurrent parseUserAgent={parseUserAgent} />
          </CardContent>
        </Card>
      )}

      {/* Other Sessions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Other Sessions</CardTitle>
              <CardDescription>
                Manage your active sessions on other devices
              </CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out from all devices?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will sign you out from all devices including this one.
                    You will need to sign in again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={revokeAllSessions}>
                    Sign Out All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessions.filter((s) => !s.is_current).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No other active sessions</p>
              <p className="text-sm">You're only signed in on this device</p>
            </div>
          ) : (
            sessions
              .filter((s) => !s.is_current && !s.revoked_at)
              .map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                >
                  <SessionCard session={session} parseUserAgent={parseUserAgent} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revokeSession(session.id)}
                    disabled={revoking === session.id}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {revoking === session.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      {/* Security Tips */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Security Tip</p>
              <p className="text-sm text-muted-foreground">
                If you see a session you don't recognize, revoke it immediately
                and consider changing your password.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface SessionCardProps {
  session: Session
  isCurrent?: boolean
  parseUserAgent: (ua: string) => {
    device: "desktop" | "mobile" | "tablet" | "unknown"
    browser: string
    os: string
  }
}

function SessionCard({ session, isCurrent, parseUserAgent }: SessionCardProps) {
  const deviceInfo = parseUserAgent(session.user_agent)
  const DeviceIcon =
    deviceInfo.device === "mobile"
      ? Smartphone
      : deviceInfo.device === "tablet"
        ? Tablet
        : Monitor

  return (
    <div className="flex items-center gap-4">
      <div className="p-2 rounded-lg bg-muted">
        <DeviceIcon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {deviceInfo.browser} on {deviceInfo.os}
          </span>
          {isCurrent && (
            <Badge variant="outline" className="text-xs">
              This device
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {session.ip_address}
              </TooltipTrigger>
              <TooltipContent>IP Address</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {session.last_sign_in_at
                  ? formatDistanceToNow(new Date(session.last_sign_in_at), {
                      addSuffix: true,
                    })
                  : "Recently"}
              </TooltipTrigger>
              <TooltipContent>
                {session.last_sign_in_at
                  ? format(new Date(session.last_sign_in_at), "PPpp")
                  : "Last activity"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}
