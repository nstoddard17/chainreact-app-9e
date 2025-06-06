import { type NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { teamsInstallations } from "@/lib/db/schema"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state")

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 })
  }

  if (!state) {
    return NextResponse.json({ error: "Missing state" }, { status: 400 })
  }

  try {
    const teamInstallation = await db.query.teamsInstallations.findFirst({
      where: eq(teamsInstallations.state, state),
    })

    if (!teamInstallation) {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 })
    }

    // TODO: Exchange the code for an access token and save it to the database.
    // https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to-create-outgoing-webhooks#code-sample-exchanging-the-code-for-an-access-token

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
