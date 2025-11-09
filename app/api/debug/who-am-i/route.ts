import { NextResponse } from "next/server"
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const dynamic = "force-dynamic"

/**
 * Debug endpoint to show current logged-in user
 * Usage: GET /api/debug/who-am-i
 */
export async function GET(request: Request) {
  try {
    // Get session from cookies
    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false
      }
    })

    // Get auth token from cookie
    const authCookie = cookieStore.get('sb-access-token') || cookieStore.get('supabase-auth-token')

    if (!authCookie) {
      return NextResponse.json({
        loggedIn: false,
        error: "No auth cookie found"
      })
    }

    const { data: { user }, error } = await supabase.auth.getUser(authCookie.value)

    if (error || !user) {
      return NextResponse.json({
        loggedIn: false,
        error: error?.message || "Not logged in"
      })
    }

    return NextResponse.json({
      loggedIn: true,
      user_id: user.id,
      user_id_short: user.id.substring(0, 8) + "...",
      email: user.email,
      created_at: user.created_at
    })
  } catch (error: any) {
    return NextResponse.json({
      loggedIn: false,
      error: error.message || "Failed to check auth"
    })
  }
}
