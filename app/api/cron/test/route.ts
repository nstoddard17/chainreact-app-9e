import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const echo = url.searchParams.get("echo") || "Hello World"

  return NextResponse.json({
    message: "Test endpoint working",
    echo: echo,
    timestamp: new Date().toISOString(),
    headers: Object.fromEntries(request.headers),
    url: request.url,
  })
}
