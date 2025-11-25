"use client"

import { createBrowserClient } from "@supabase/ssr"
import { type ReactNode, useState } from "react"
import { SupabaseContext } from "@/lib/supabase-context"

interface SupabaseProviderProps {
  children: ReactNode
}

const SupabaseProvider = ({ children }: SupabaseProviderProps) => {
  const [supabaseClient] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Keep encoding consistent with middleware/server helpers for cross-tab auth
      cookieEncoding: 'raw'
    }
  ))

  return (
    <SupabaseContext.Provider value={{ supabase: supabaseClient }}>
      {children}
    </SupabaseContext.Provider>
  )
}

export default SupabaseProvider
