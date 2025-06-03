"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle, RefreshCw, ArrowLeft, Bug } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export default function SessionDebugContent() {
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
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Initializing session...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/integrations">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Integrations
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center space-x-2">
                <Bug className="w-8 h-8" />
                <span>Session Debug</span>
              </h1>
              <p className="text-slate-600 mt-1">Debug Supabase session and cookie handling</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
            Development Tool
          </Badge>
        </div>

        {/* Client Session Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {user ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              <span>Client-Side Session</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Authentication Status</div>
                <div className={`text-lg font-semibold ${user ? "text-green-600" : "text-red-600"}`}>
                  {user ? "✓ Authenticated" : "✗ Not authenticated"}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">User ID</div>
                <div className="font-mono text-sm bg-gray-100 p-2 rounded">{user?.id || "None"}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Email</div>
                <div className="text-sm bg-gray-100 p-2 rounded">{user?.email || "None"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Server Session Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {debugInfo?.session?.hasSession ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              <span>Server-Side Session</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {debugInfo ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-700">Session Available</div>
                    <div
                      className={`text-lg font-semibold ${debugInfo.session?.hasSession ? "text-green-600" : "text-red-600"}`}
                    >
                      {debugInfo.session?.hasSession ? "✓ Available" : "✗ Not available"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-700">Server User</div>
                    <div
                      className={`text-lg font-semibold ${debugInfo.user?.hasUser ? "text-green-600" : "text-red-600"}`}
                    >
                      {debugInfo.user?.hasUser ? "✓ Available" : "✗ Not available"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-700">Supabase Cookies</div>
                    <div className="text-lg font-semibold text-blue-600">
                      {debugInfo.cookies?.supabase?.length || 0} cookies
                    </div>
                  </div>
                </div>

                {debugInfo.session?.error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded">
                    <div className="text-sm font-medium text-red-800">Session Error:</div>
                    <div className="text-sm text-red-700 font-mono">{debugInfo.session.error}</div>
                  </div>
                )}

                {debugInfo.user?.error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded">
                    <div className="text-sm font-medium text-red-800">User Error:</div>
                    <div className="text-sm text-red-700 font-mono">{debugInfo.user.error}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500">Loading server session info...</div>
            )}
          </CardContent>
        </Card>

        {/* Cookie Details */}
        <Card>
          <CardHeader>
            <CardTitle>Cookie Details</CardTitle>
          </CardHeader>
          <CardContent>
            {debugInfo?.cookies ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-700">Total Cookies</div>
                    <div className="text-lg font-semibold">{debugInfo.cookies.total}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-700">Supabase Cookies</div>
                    <div className="text-lg font-semibold">{debugInfo.cookies.supabase?.length || 0}</div>
                  </div>
                </div>

                {debugInfo.cookies.supabase && debugInfo.cookies.supabase.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-700">Supabase Cookie Names</div>
                    <div className="bg-gray-100 p-3 rounded">
                      {debugInfo.cookies.supabase.map((cookie: string, index: number) => (
                        <div key={index} className="font-mono text-sm">
                          {cookie}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">All Cookie Names</div>
                  <div className="bg-gray-100 p-3 rounded max-h-40 overflow-y-auto">
                    {debugInfo.cookies.all?.map((cookie: string, index: number) => (
                      <div key={index} className="font-mono text-xs text-slate-600">
                        {cookie}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500">Loading cookie information...</div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Debug Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={checkSession} disabled={loading} className="w-full md:w-auto">
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Debug Info
                </>
              )}
            </Button>

            {!user && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-yellow-800">Authentication Required</div>
                    <div className="text-sm text-yellow-700 mt-1">
                      You must be logged in before starting OAuth flows. The callback routes need access to your session
                      cookie.
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 bg-blue-50 border border-blue-200 rounded">
              <div className="flex items-start space-x-3">
                <Bug className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <div className="font-medium text-blue-800">Debug Information</div>
                  <div className="text-sm text-blue-700 mt-1">
                    This page helps debug OAuth callback issues by showing client and server session states. Use this
                    information to troubleshoot authentication problems.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
