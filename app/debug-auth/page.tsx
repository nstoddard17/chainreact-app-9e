"use client"

import { useEffect, useState } from 'react'
import { supabase } from "@/utils/supabaseClient"

export default function DebugAuthPage() {
  const [authState, setAuthState] = useState<any>(null)
  const [pendingSignup, setPendingSignup] = useState<any>(null)
  const [urlParams, setUrlParams] = useState<any>(null)

  useEffect(() => {
    // Get current auth state
    const checkAuth = async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      setAuthState({ user, error })
    }
    
    checkAuth()

    // Get pending signup data
    const pending = localStorage.getItem('pendingSignup')
    if (pending) {
      setPendingSignup(JSON.parse(pending))
    }

    // Get URL parameters
    const params = new URLSearchParams(window.location.search)
    const paramObj: any = {}
    for (const [key, value] of params.entries()) {
      paramObj[key] = value
    }
    setUrlParams(paramObj)
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Auth Debug</h1>
      
      <div className="grid gap-6">
        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Current Auth State</h2>
          <pre className="text-sm bg-slate-900 p-4 rounded overflow-auto">
            {JSON.stringify(authState, null, 2)}
          </pre>
        </div>

        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Pending Signup Data</h2>
          <pre className="text-sm bg-slate-900 p-4 rounded overflow-auto">
            {JSON.stringify(pendingSignup, null, 2)}
          </pre>
        </div>

        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">URL Parameters</h2>
          <pre className="text-sm bg-slate-900 p-4 rounded overflow-auto">
            {JSON.stringify(urlParams, null, 2)}
          </pre>
        </div>

        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Expected Flow</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>User registers → pendingSignup stored, user unconfirmed</li>
            <li>User clicks email → /api/auth/callback → user confirmed → redirect to /auth/waiting-confirmation?confirmed=true</li>
            <li>Waiting page sees confirmed=true → removes pendingSignup → redirect to /setup-username</li>
          </ol>
        </div>
      </div>
    </div>
  )
}