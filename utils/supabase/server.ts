import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { Database } from "@/types/supabase"

export function createClient() {
  const cookieStore = cookies()
  return createServerComponentClient<Database>({ cookies: () => cookieStore })
}

// Add the missing createServerClient export
export function createServerClient() {
  const cookieStore = cookies()
  return createServerComponentClient<Database>({ cookies: () => cookieStore })
}

export async function getSession() {
  const supabase = createClient()
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
  const supabase = createClient()
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

export async function getUserId() {
  const user = await getUser()
  return user?.id
}

export async function requireAuth() {
  const session = await getSession()
  if (!session) {
    throw new Error("Unauthorized")
  }
  return session
}
