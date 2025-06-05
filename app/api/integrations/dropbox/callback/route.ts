import type { NextRequest } from "next/server"
import { handleOAuthCallback } from "@/lib/oauth/handleOAuthCallback"
import { DropboxOAuthService } from "@/lib/oauth/DropboxOAuthService"

export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, "dropbox", DropboxOAuthService)
}
