"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/utils/supabaseClient"

export default function DebugAuth() {
  const [debugInfo, setDebugInfo] = useState<any>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        // Check current user
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        const info = {
          session: session ? 'EXISTS' : 'NULL',
          sessionError,
          user: user ? user.email : 'NULL',
          userError,
          url: window.location.href,
          hash: window.location.hash,
          timestamp: new Date().toISOString()
        }
        
        setDebugInfo(info)
        console.log('🔍 Auth Debug Info:', info)
      } catch (error) {
        console.error('Debug error:', error)
        setDebugInfo({ error: error.message })
      }
    }

    checkAuth()
    
    // Also check on auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔍 Auth state changed:', event, session?.user?.email || 'no user')
      checkAuth()
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!debugInfo) return <div style={{position: 'fixed', top: 0, right: 0, background: 'red', color: 'white', padding: '10px', zIndex: 9999}}>Loading debug...</div>

  return (
    <div style={{position: 'fixed', top: 0, right: 0, background: 'black', color: 'white', padding: '10px', zIndex: 9999, maxWidth: '300px', fontSize: '12px'}}>
      <strong>Auth Debug:</strong>
      <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
    </div>
  )
}