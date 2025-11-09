import { NextResponse } from "next/server"
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = "force-dynamic"

/**
 * Debug endpoint to show current logged-in user
 * Usage: GET /api/debug/who-am-i
 */
export async function GET(request: Request) {
  const supabase = createServerClient()

  const { data: { user }, error } = await supabase.auth.getUser()

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
}
