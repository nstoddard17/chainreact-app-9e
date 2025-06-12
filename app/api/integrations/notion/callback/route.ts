import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { generateState } from "arctic"
import { microsoft } from "@/lib/auth"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const state = generateState()
  const url = await microsoft.createAuthorizationURL(state, {
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Team.ReadBasic.All",
      "https://graph.microsoft.com/Channel.ReadBasic.All",
      "https://graph.microsoft.com/Chat.ReadWrite",
      "https://graph.microsoft.com/ChatMessage.Send",
    ],
  })

  cookies().set("microsoft_auth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  })

  return NextResponse.redirect(url)
}
