import { type NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, slackId } = body

    if (!userId || !slackId) {
      return new NextResponse("Missing user ID or Slack ID", { status: 400 })
    }

    // Update the user's Slack ID in the database
    await db.update(users).set({ slackId: slackId }).where(eq(users.id, userId))

    return NextResponse.json({ message: "Slack ID updated successfully" })
  } catch (error) {
    console.error("Error updating Slack ID:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
