"use client"

import { createContext, useContext } from "react"
import { type SupabaseClient } from "@supabase/supabase-js"

type SupabaseContextType = {
  supabase: SupabaseClient | null
}

export const SupabaseContext = createContext<SupabaseContextType>({ supabase: null })

export const useSupabase = () => {
  const context = useContext(SupabaseContext)
  if (context === undefined) {
    throw new Error("useSupabase must be used within a SupabaseProvider")
  }
  return context
} 