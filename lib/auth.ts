import { createClient } from "@supabase/supabase-js"
import { Microsoft } from "arctic"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables")
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
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

    const { data, error } = await supabase
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
    const { data, error } = await supabase.from("sessions").select("*, users(*)").eq("id", sessionId).single()

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
    await supabase.from("sessions").delete().eq("id", sessionId)
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

export async function validateRequest() {
  // This would need to be implemented based on your cookie handling
  return { user: null, session: null }
}

// Microsoft OAuth configuration
const microsoftClientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
const microsoftClientSecret = process.env.TEAMS_CLIENT_SECRET

if (!microsoftClientId || !microsoftClientSecret) {
  console.warn("Microsoft Teams OAuth not configured - missing client ID or secret")
}

export const microsoft =
  microsoftClientId && microsoftClientSecret
    ? new Microsoft(
        microsoftClientId,
        microsoftClientSecret,
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/integrations/teams/callback`,
      )
    : null
