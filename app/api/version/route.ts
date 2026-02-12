import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Returns the current build version.
 * This is used by the client to detect when a new version has been deployed.
 * The BUILD_ID is set at build time by Next.js.
 */
export async function GET() {
  // Use Next.js BUILD_ID if available, otherwise use a timestamp-based fallback
  const buildId = process.env.BUILD_ID ||
                  process.env.NEXT_PUBLIC_BUILD_ID ||
                  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
                  "development"

  return NextResponse.json(
    {
      version: buildId,
      timestamp: Date.now()
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    }
  )
}
