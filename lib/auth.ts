import { Lucia } from "lucia"
import { cookies } from "next/headers"
import { cache } from "react"
import type { Session, User } from "lucia"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Custom adapter for Lucia using Supabase
const supabaseAdapter = {
  async getSessionAndUser(sessionId: string) {
    const { data: session } = await supabase.from("sessions").select("*, users(*)").eq("id", sessionId).single()

    if (!session) return [null, null]

    return [
      {
        id: session.id,
        userId: session.user_id,
        expiresAt: new Date(session.expires_at),
        fresh: false,
      },
      {
        id: session.users.id,
        email: session.users.email,
        name: session.users.name,
      },
    ]
  },

  async getUserSessions(userId: string) {
    const { data: sessions } = await supabase.from("sessions").select("*").eq("user_id", userId)

    return (
      sessions?.map((session) => ({
        id: session.id,
        userId: session.user_id,
        expiresAt: new Date(session.expires_at),
        fresh: false,
      })) || []
    )
  },

  async setSession(session: any) {
    await supabase.from("sessions").insert({
      id: session.id,
      user_id: session.userId,
      expires_at: session.expiresAt.toISOString(),
    })
  },

  async updateSessionExpiration(sessionId: string, expiresAt: Date) {
    await supabase.from("sessions").update({ expires_at: expiresAt.toISOString() }).eq("id", sessionId)
  },

  async deleteSession(sessionId: string) {
    await supabase.from("sessions").delete().eq("id", sessionId)
  },

  async deleteUserSessions(userId: string) {
    await supabase.from("sessions").delete().eq("user_id", userId)
  },

  async deleteExpiredSessions() {
    await supabase.from("sessions").delete().lt("expires_at", new Date().toISOString())
  },
}

export const lucia = new Lucia(supabaseAdapter as any, {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === "production",
    },
  },
  getUserAttributes: (attributes: any) => {
    return {
      email: attributes.email,
      name: attributes.name,
    }
  },
})

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia
    DatabaseUserAttributes: {
      email: string
      name?: string
    }
  }
}

export const validateRequest = cache(
  async (): Promise<{ user: User; session: Session } | { user: null; session: null }> => {
    const sessionId = cookies().get(lucia.sessionCookieName)?.value ?? null
    if (!sessionId) {
      return {
        user: null,
        session: null,
      }
    }

    const result = await lucia.validateSession(sessionId)
    try {
      if (result.session && result.session.fresh) {
        const sessionCookie = lucia.createSessionCookie(result.session.id)
        cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
      }
      if (!result.session) {
        const sessionCookie = lucia.createBlankSessionCookie()
        cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
      }
    } catch {}
    return result
  },
)

export function generateId(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
