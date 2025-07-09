import { type NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const email = url.searchParams.get("email")

    if (!email) {
      return NextResponse.json({ user: null, message: "Email parameter is required" }, { status: 400 })
    }

    const { data: user, error } = await db
      .from("users")
      .select("*")
      .eq("email", email)
      .single()

    if (error || !user) {
      return NextResponse.json({ user: null, message: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ user, message: "User found" }, { status: 200 })
  } catch (error) {
    console.error("[INTEGRATIONS_AUTH_GET]", error)
    return NextResponse.json({ user: null, message: "Internal error" }, { status: 500 })
  }
}
