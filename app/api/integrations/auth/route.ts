import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { accounts, integrations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(req: NextRequest) {
  try {
    const { integrationId, userId, accessToken, refreshToken } = await req.json()

    if (!integrationId || !userId || !accessToken || !refreshToken) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 })
    }

    // Check if the integration exists
    const integration = await db.select().from(integrations).where(eq(integrations.id, integrationId))

    if (!integration || integration.length === 0) {
      return NextResponse.json({ message: "Integration not found" }, { status: 404 })
    }

    // Check if an account already exists for this user and integration
    const existingAccount = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .where(eq(accounts.integrationId, integrationId))

    if (existingAccount && existingAccount.length > 0) {
      // Update the existing account
      await db
        .update(accounts)
        .set({ accessToken: accessToken, refreshToken: refreshToken })
        .where(eq(accounts.userId, userId))
        .where(eq(accounts.integrationId, integrationId))

      return NextResponse.json({ message: "Account updated successfully" }, { status: 200 })
    } else {
      // Create a new account
      await db.insert(accounts).values({
        integrationId: integrationId,
        userId: userId,
        accessToken: accessToken,
        refreshToken: refreshToken,
      })

      return NextResponse.json({ message: "Account created successfully" }, { status: 201 })
    }
  } catch (error) {
    console.error("Error creating/updating account:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
