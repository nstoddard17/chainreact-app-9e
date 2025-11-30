import { createClient } from "@supabase/supabase-js"

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables")
}

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Required generateId export
export function generateId(length = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Custom auth implementation without Lucia
export const lucia = {
  async createSession(userId: string) {
    const sessionId = generateId(32)
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) // 30 days

    const { data, error } = await getSupabase()
      .from("sessions")
      .insert({
        id: sessionId,
        user_id: userId,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return { id: sessionId, userId, expiresAt }
  },

  async validateSession(sessionId: string) {
    const { data, error } = await getSupabase().from("sessions").select("*, users(*)").eq("id", sessionId).single()

    if (error || !data) return { session: null, user: null }

    const session = {
      id: data.id,
      userId: data.user_id,
      expiresAt: new Date(data.expires_at),
    }

    const user = data.users

    return { session, user }
  },

  async invalidateSession(sessionId: string) {
    await getSupabase().from("sessions").delete().eq("id", sessionId)
  },

  createSessionCookie(sessionId: string) {
    return {
      name: "session",
      value: sessionId,
      attributes: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 60 * 60 * 24 * 30, // 30 days
      },
    }
  },

  createBlankSessionCookie() {
    return {
      name: "session",
      value: "",
      attributes: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        maxAge: 0,
      },
    }
  },

  sessionCookieName: "session",
}

// Add missing auth export (alias for lucia)
export const auth = lucia

// Add missing getAuthSession function
export async function getAuthSession() {
  try {
    // This would need to be implemented based on your cookie handling
    // For now, return null - you'll need to implement proper session validation
    const { user, session } = await validateRequest()
    return { user, session }
  } catch (error) {
    logger.error("Error getting auth session:", error)
    return { user: null, session: null }
  }
}

export async function validateRequest() {
  // This would need to be implemented based on your cookie handling
  return { user: null, session: null }
}
