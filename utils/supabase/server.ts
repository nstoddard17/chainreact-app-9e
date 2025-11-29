import { type Database } from '@/types/supabase'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

import { logger } from '@/lib/utils/logger'

async function getCookieStore() {
  const { cookies } = await import('next/headers')
  return cookies()
}

export async function createSupabaseServerClient() {
  const cookieStore = await getCookieStore()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieEncoding: 'raw', // Use raw encoding to avoid base64- prefix that causes JSON parsing errors
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            logger.warn("Failed to set cookies in server client:", error)
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export async function createSupabaseServerActionClient() {
  const cookieStore = await getCookieStore()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieEncoding: 'raw', // Use raw encoding to avoid base64- prefix that causes JSON parsing errors
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            logger.warn("Failed to set cookies in server action client:", error)
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export async function createSupabaseRouteHandlerClient() {
  const cookieStore = await getCookieStore()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieEncoding: 'raw', // Use raw encoding to avoid base64- prefix that causes JSON parsing errors
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            logger.warn("Failed to set cookies in route handler client:", error)
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export async function createSupabaseServiceClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {
          // Service role doesn't need to set cookies
        },
      },
    }
  )
}

// Alias for compatibility
export const createClient = createSupabaseServerClient
