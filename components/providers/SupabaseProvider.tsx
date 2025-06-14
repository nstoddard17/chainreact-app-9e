"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { SessionContextProvider } from "@supabase/auth-helpers-react"
import { type ReactNode, useState, useEffect } from "react"

interface SupabaseProviderProps {
  children: ReactNode
}

const SupabaseProvider = ({ children }: SupabaseProviderProps) => {
  const [supabaseClient] = useState(() => createClientComponentClient())
  const [session, setSession] = useState(null)

  useEffect(() => {
    async function getInitialSession() {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      setSession(session)
    }

    getInitialSession()

    supabaseClient.auth.onAuthStateChange((event, session) => {
      setSession(session)
    })
  }, [supabaseClient])

  return (
    <SessionContextProvider supabaseClient={supabaseClient} initialSession={session}>
      {children}
    </SessionContextProvider>
  )
}

export default SupabaseProvider
