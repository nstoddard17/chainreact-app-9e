import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const supabase = createServerComponentClient({ cookies })

    // Log all cookies
    const allCookies = cookieStore.getAll()
    console.log("=== COOKIE DEBUG ===")
    console.log("Total cookies:", allCookies.length)

    // Look for Supabase-related cookies
    const supabaseCookies = allCookies.filter(
      (cookie) => cookie.name.includes("supabase") || cookie.name.includes("sb-") || cookie.name.includes("auth"),
    )

    console.log("Supabase cookies found:", supabaseCookies.length)
    supabaseCookies.forEach((cookie) => {
      console.log(`Cookie: ${cookie.name}`)
      console.log(`Value length: ${cookie.value?.length || 0}`)
      console.log(`Value preview: ${cookie.value?.substring(0, 50)}...`)
    })

    // Try to get session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    console.log("Session data:", {
      hasSession: !!sessionData.session,
      hasUser: !!sessionData.session?.user,
      userId: sessionData.session?.user?.id,
      error: sessionError,
    })

    // Try to get user directly
    const { data: userData, error: userError } = await supabase.auth.getUser()

    console.log("User data:", {
      hasUser: !!userData.user,
      userId: userData.user?.id,
      error: userError,
    })

    return NextResponse.json({
      cookies: {
        total: allCookies.length,
        supabase: supabaseCookies.map((c) => ({
          name: c.name,
          hasValue: !!c.value,
          valueLength: c.value?.length || 0,
        })),
      },
      session: {
        hasSession: !!sessionData.session,
        hasUser: !!sessionData.session?.user,
        userId: sessionData.session?.user?.id,
        error: sessionError?.message,
      },
      user: {
        hasUser: !!userData.user,
        userId: userData.user?.id,
        error: userError?.message,
      },
      requestInfo: {
        url: request.url,
        origin: request.headers.get("origin"),
        referer: request.headers.get("referer"),
        userAgent: request.headers.get("user-agent"),
        host: request.headers.get("host"),
      },
    })
  } catch (error: any) {
    console.error("Debug session error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
