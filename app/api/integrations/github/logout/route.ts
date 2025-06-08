import { type NextRequest, NextResponse } from "next/server"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const returnTo = searchParams.get("return_to")

  if (!returnTo) {
    return NextResponse.redirect(`${getBaseUrl()}/integrations?error=missing_return_to`)
  }

  // Create a response that will clear GitHub session and redirect
  const response = NextResponse.redirect(returnTo)

  // Clear any GitHub-related cookies
  response.cookies.delete("_gh_sess")
  response.cookies.delete("logged_in")
  response.cookies.delete("dotcom_user")
  response.cookies.delete("user_session")

  // Add headers to prevent caching
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")

  return response
}
