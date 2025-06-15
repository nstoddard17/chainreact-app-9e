import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    // Add CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }

    const supabase = createRouteHandlerClient({ cookies })

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
    }

    // Mock chart data for now - replace with real queries later
    const chartData = [
      { name: "Mon", workflows: 12, executions: 45 },
      { name: "Tue", workflows: 19, executions: 67 },
      { name: "Wed", workflows: 8, executions: 23 },
      { name: "Thu", workflows: 15, executions: 52 },
      { name: "Fri", workflows: 22, executions: 78 },
      { name: "Sat", workflows: 6, executions: 18 },
      { name: "Sun", workflows: 4, executions: 12 },
    ]

    return NextResponse.json({ data: chartData }, { status: 200, headers })
  } catch (error) {
    console.error("Analytics chart data error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
