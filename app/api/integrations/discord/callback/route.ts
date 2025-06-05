import type { NextRequest } from "next/server"
import { handleOAuthCallback } from "@/lib/oauth/handleOAuthCallback"
import { DiscordOAuthService } from "@/lib/oauth/DiscordOAuthService"

export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, "discord", DiscordOAuthService)
}
