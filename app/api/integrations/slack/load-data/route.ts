import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getSlackChannels } from "@/lib/integrations/slack"
import { getValidAccessToken } from "@/lib/integrations/getValidAccessToken"

export async function GET(
  req: Request,
  { params }: { params: { provider: string } },
) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const provider = "slack" // Hardcoded for now

  try {
    const { accessToken, valid } = await getValidAccessToken(userId, provider)

    if (!valid || !accessToken) {
      return NextResponse.json(
        { error: "Slack connection is not valid or requires re-authentication." },
        { status: 401 },
      )
    }

    const channels = await getSlackChannels(accessToken)

    return NextResponse.json({ channels })
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to load Slack data: ${error.message}` },
      { status: 500 },
    )
  }
} 