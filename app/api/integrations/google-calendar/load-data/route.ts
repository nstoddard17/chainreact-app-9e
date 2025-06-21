import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { type CookieOptions, createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getGoogleCalendars } from "@/lib/integrations/google-calendar"
import { getValidAccessToken } from "@/lib/integrations/getValidAccessToken"

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const provider = "google-calendar"

  try {
    const { accessToken, valid } = await getValidAccessToken(userId, provider)

    if (!valid || !accessToken) {
      return NextResponse.json(
        {
          error:
            "Google Calendar connection is not valid or requires re-authentication.",
        },
        { status: 401 },
      )
    }

    const calendars = await getGoogleCalendars(accessToken)

    return NextResponse.json({ calendars })
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to load Google Calendar data: ${error.message}` },
      { status: 500 },
    )
  }
} 