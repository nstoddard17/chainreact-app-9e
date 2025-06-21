import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getGoogleContacts } from "@/lib/integrations/gmail"
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
  const provider = "google"

  try {
    const { accessToken, valid } = await getValidAccessToken(userId, provider)

    if (!valid || !accessToken) {
      return NextResponse.json(
        {
          error:
            "Google connection is not valid or requires re-authentication.",
        },
        { status: 401 },
      )
    }

    const contacts = await getGoogleContacts(accessToken)

    return NextResponse.json({ contacts })
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to load Google data: ${error.message}` },
      { status: 500 },
    )
  }
} 