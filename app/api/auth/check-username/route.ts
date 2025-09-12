import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { username } = await request.json()

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 })
    }

    const supabase = await createSupabaseRouteHandlerClient()

    // Check if username already exists
    const { data, error } = await supabase
      .from("user_profiles")
      .select("username")
      .eq("username", username)
      .single()

    if (error) {
      // PGRST116 means no rows found, which is what we want
      if (error.code === "PGRST116") {
        return NextResponse.json({ exists: false })
      }
      
      console.error("Error checking username:", error)
      return NextResponse.json({ error: "Failed to check username" }, { status: 500 })
    }

    // If data exists, username is taken
    return NextResponse.json({ exists: true })
  } catch (error) {
    console.error("Error in check-username route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
