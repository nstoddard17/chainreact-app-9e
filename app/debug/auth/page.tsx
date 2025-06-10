"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase-singleton"
import { useAuthStore } from "@/stores/authStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function AuthDebugPage() {
  const [debugInfo, setDebugInfo] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const { user, session, profile, error, initialized } = useAuthStore()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const info: any = {
          supabaseAvailable: !!supabase,
          envVars: {
            supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          },
        }

        if (supabase) {
          // Check session
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
          info.session = {
            exists: !!sessionData.session,
            error: sessionError?.message,
          }

          // Check user
          const { data: userData, error: userError } = await supabase.auth.getUser()
          info.user = {
            exists: !!userData.user,
            error: userError?.message,
          }

          // Test database connection
          try {
            const { data, error } = await supabase.from("user_profiles").select("count").limit(1)
            info.database = {
              connected: !error,
              error: error?.message,
            }
          } catch (dbError: any) {
            info.database = {
              connected: false,
              error: dbError.message,
            }
          }
        }

        setDebugInfo(info)
      } catch (error: any) {
        setDebugInfo({ error: error.message })
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const testGoogleAuth = async () => {
    try {
      if (!supabase) {
        alert("Supabase not available")
        return
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/debug/auth`,
        },
      })

      if (error) {
        alert(`Google auth error: ${error.message}`)
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  if (loading) {
    return <div className="p-8">Loading debug info...</div>
  }

  return (
    <div className="container mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-bold">Authentication Debug</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>Supabase Available: {debugInfo.supabaseAvailable ? "✅" : "❌"}</div>
            <div>Supabase URL: {debugInfo.envVars?.supabaseUrl ? "✅" : "❌"}</div>
            <div>Supabase Anon Key: {debugInfo.envVars?.supabaseAnonKey ? "✅" : "❌"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>Connected: {debugInfo.database?.connected ? "✅" : "❌"}</div>
            {debugInfo.database?.error && <div className="text-red-600 text-sm">Error: {debugInfo.database.error}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auth Store State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>Initialized: {initialized ? "✅" : "❌"}</div>
            <div>User: {user ? "✅" : "❌"}</div>
            <div>Session: {session ? "✅" : "❌"}</div>
            <div>Profile: {profile ? "✅" : "❌"}</div>
            {error && <div className="text-red-600 text-sm">Error: {error}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>Session Exists: {debugInfo.session?.exists ? "✅" : "❌"}</div>
            <div>User Exists: {debugInfo.user?.exists ? "✅" : "❌"}</div>
            {debugInfo.session?.error && (
              <div className="text-red-600 text-sm">Session Error: {debugInfo.session.error}</div>
            )}
            {debugInfo.user?.error && <div className="text-red-600 text-sm">User Error: {debugInfo.user.error}</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={testGoogleAuth} className="w-full">
            Test Google OAuth
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw Debug Data</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs overflow-auto bg-gray-100 p-4 rounded">
            {JSON.stringify({ debugInfo, user, session, profile }, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
