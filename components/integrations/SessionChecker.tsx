"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react"

export function SessionChecker() {
  const { user, session, initialized } = useAuthStore()
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const checkSession = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/integrations/debug-session")
      const data = await response.json()
      setDebugInfo(data)
    } catch (error) {
      console.error("Failed to check session:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialized) {
      checkSession()
    }
  }, [initialized])

  if (!initialized) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Initializing session...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          {user ? <CheckCircle className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
          <span>Session Status</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <strong>Client Session:</strong>
            <div className={user ? "text-green-600" : "text-red-600"}>
              {user ? "✓ Authenticated" : "✗ Not authenticated"}
            </div>
          </div>
          <div>
            <strong>User ID:</strong>
            <div className="font-mono text-xs">{user?.id || "None"}</div>
          </div>
        </div>

        {debugInfo && (
          <div className="space-y-2">
            <strong>Server Session Debug:</strong>
            <div className="bg-gray-100 p-3 rounded text-xs font-mono">
              <div>Server Session: {debugInfo.session?.hasSession ? "✓" : "✗"}</div>
              <div>Server User: {debugInfo.user?.hasUser ? "✓" : "✗"}</div>
              <div>Supabase Cookies: {debugInfo.cookies?.supabase?.length || 0}</div>
              {debugInfo.session?.error && <div className="text-red-600">Error: {debugInfo.session.error}</div>}
            </div>
          </div>
        )}

        <Button onClick={checkSession} disabled={loading} size="sm">
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Checking...
            </>
          ) : (
            "Refresh Debug Info"
          )}
        </Button>

        {!user && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800">
              <strong>Warning:</strong> You must be logged in before starting OAuth flows. The callback route needs
              access to your session cookie.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
