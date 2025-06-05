import type { NextRequest } from "next/server"
import { handleOAuthCallback } from "@/lib/oauth/handleOAuthCallback"
import { SlackOAuthService } from "@/lib/oauth/SlackOAuthService"

export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, "slack", SlackOAuthService)
}
