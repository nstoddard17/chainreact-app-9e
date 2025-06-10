import type { NextRequest } from "next/server"
import { handleOAuthCallback } from "@/lib/oauth/callbackHandler"

export async function GET(req: NextRequest) {
  return handleOAuthCallback(req, "microsoft")
}
