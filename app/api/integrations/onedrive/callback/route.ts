import { db } from "@/lib/db"
import { accounts } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 })
  }

  try {
    // TODO: Exchange code for tokens and store them in the database
    // For now, just log the code and state
    console.log("Code:", code)
    console.log("State:", state)

    // Example of how to update the database (replace with actual logic)
    // Assuming the state is the user's ID
    const userId = state

    if (userId) {
      // Update the user's account with OneDrive details (replace with actual data)
      await db
        .update(accounts)
        .set({
          onedriveConnected: true,
          onedriveRefreshToken: "dummy_refresh_token", // Replace with actual refresh token
        })
        .where(eq(accounts.userId, userId))

      console.log(`User ${userId} OneDrive connection updated.`)
    } else {
      console.warn("No user ID found in state.")
    }

    // Redirect the user back to the app (replace with your app's URL)
    return NextResponse.redirect(new URL("/dashboard", request.url))
  } catch (error) {
    console.error("Error during OneDrive callback:", error)
    return NextResponse.json({ error: "Failed to process OneDrive callback" }, { status: 500 })
  }
}
