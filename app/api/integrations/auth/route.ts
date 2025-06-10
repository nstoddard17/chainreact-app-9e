import { type NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"

export async function GET(req: NextRequest) {
  try {
    // Check if database is available
    if (!db) {
      return NextResponse.json(
        {
          user: null,
          message: "Database not configured",
        },
        { status: 503 },
      )
    }

    const url = new URL(req.url)
    const email = url.searchParams.get("email")

    if (!email) {
      return NextResponse.json(
        {
          user: null,
          message: "Email parameter is required",
        },
        { status: 400 },
      )
    }

    const user = await db.select().from(users).where(eq(users.email, email))

    if (!user || user.length === 0) {
      return NextResponse.json(
        {
          user: null,
          message: "User not found",
        },
        { status: 404 },
      )
    }

    return NextResponse.json(
      {
        user: user[0],
        message: "User found",
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[INTEGRATIONS_AUTH_GET]", error)
    return NextResponse.json(
      {
        user: null,
        message: "Internal error",
      },
      { status: 500 },
    )
  }
}
