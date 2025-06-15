import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { Database } from "@/types/supabase"

export const createClient = () => {
  return createServerComponentClient<Database>({ cookies })
}

// Add this export after the createClient function
export const createServerClient = () => {
  return createServerComponentClient<Database>({ cookies })
}

// Secure function to get authenticated user
export const getUser = async () => {
  const supabase = createClient()

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      console.error("Error getting user:", error)
      return null
    }

    return user
  } catch (error) {
    console.error("Failed to get user:", error)
    return null
  }
}

// Function to get session (use sparingly, prefer getUser for authentication)
export const getSession = async () => {
  const supabase = createClient()

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error) {
      console.error("Error getting session:", error)
      return null
    }

    return session
  } catch (error) {
    console.error("Failed to get session:", error)
    return null
  }
}

// Helper function to check if user is authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  const user = await getUser()
  return !!user
}
