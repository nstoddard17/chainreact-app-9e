import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getGoogleDriveFiles } from "@/lib/integrations/google-drive"
import { getValidAccessToken } from "@/lib/integrations/getValidAccessToken"

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const folderId = searchParams.get("folderId") || undefined

  const userId = session.user.id
  const provider = "google-drive"

  try {
    const { accessToken, valid } = await getValidAccessToken(userId, provider)

    if (!valid || !accessToken) {
      return NextResponse.json(
        {
          error:
            "Google Drive connection is not valid or requires re-authentication.",
        },
        { status: 401 },
      )
    }

    const files = await getGoogleDriveFiles(accessToken, folderId)

    return NextResponse.json({ files })
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to load Google Drive data: ${error.message}` },
      { status: 500 },
    )
  }
} 