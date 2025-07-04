import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { Database } from "@/types/supabase"

// Client-side Supabase client - safe to use in client components
export function createClient() {
  return createClientComponentClient<Database>()
}

// Singleton pattern for client-side usage
let supabaseClient: ReturnType<typeof createClientComponentClient<Database>> | null = null

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClientComponentClient<Database>()
  }
  return supabaseClient
}

// Client-side auth helpers
export async function getSession() {
  const supabase = getSupabaseClient()
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session
  } catch (error) {
    console.error("Error getting session:", error)
    return null
  }
}

export async function getUser() {
  const supabase = getSupabaseClient()
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  } catch (error) {
    console.error("Error getting user:", error)
    return null
  }
}

export async function signOut() {
  const supabase = getSupabaseClient()
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    return { success: true }
  } catch (error) {
    console.error("Error signing out:", error)
    return { success: false, error }
  }
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabaseClient()
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error("Error signing in:", error)
    return { success: false, error }
  }
}

export async function signUpWithEmail(email: string, password: string) {
  const supabase = getSupabaseClient()
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error("Error signing up:", error)
    return { success: false, error }
  }
}
