import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const userId = requestUrl.searchParams.get("user_id")

  if (code && userId) {
    const supabase = createRouteHandlerClient({ cookies })

    // Exchange the code for the session
    const { data: tokenData, error: tokenError } = await supabase.auth.exchangeCodeForSession(code)

    if (tokenError) {
      console.error("Error exchanging code for session:", tokenError)
      return NextResponse.redirect(`${requestUrl.origin}/auth/error?error=invalid_token`)
    }

    const { access_token } = tokenData.session

    // Fetch user info from Notion API
    const notionApiUrl = "https://api.notion.com/v1/users/me"
    const headers = {
      Authorization: `Bearer ${access_token}`,
      "Notion-Version": "2022-06-28",
    }

    const [userInfoResponse, botInfoResponse] = await Promise.all([
      fetch(notionApiUrl, { headers }),
      fetch("https://api.notion.com/v1/bots/me", { headers }),
    ])

    if (!userInfoResponse.ok) {
      console.error("Failed to fetch Notion user info:", userInfoResponse.status, userInfoResponse.statusText)
      return NextResponse.redirect(`${requestUrl.origin}/auth/error?error=failed_user_info`)
    }

    if (!botInfoResponse.ok) {
      console.error("Failed to fetch Notion bot info:", botInfoResponse.status, botInfoResponse.statusText)
      return NextResponse.redirect(`${requestUrl.origin}/auth/error?error=failed_bot_info`)
    }

    const userInfo = await userInfoResponse.json()
    const botInfo = await botInfoResponse.json()

    const integrationData = {
      user_id: userId,
      provider: "notion",
      provider_user_id: botInfo.owner?.user?.id || botInfo.owner?.workspace?.id || "unknown",
      access_token,
      status: "connected" as const,
      scopes: ["read_content", "insert_content", "update_content"],
      metadata: {
        workspace_name: botInfo.workspace_name,
        workspace_id: botInfo.workspace_id,
        bot_id: botInfo.id,
        owner: botInfo.owner,
        connected_at: new Date().toISOString(),
      },
    }

    // Use proper upsert with conflict resolution
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "notion")
      .maybeSingle()

    if (existingIntegration) {
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id)

      if (updateError) {
        console.error("Failed to update Notion integration:", updateError)
        throw updateError
      }
    } else {
      const { error: insertError } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: new Date().toISOString(),
      })

      if (insertError) {
        console.error("Failed to insert Notion integration:", insertError)
        throw insertError
      }
    }

    // URL to redirect to after sign in process completes
    return NextResponse.redirect(`${requestUrl.origin}/integrations`)
  }

  // URL to redirect to if code is not found
  return NextResponse.redirect(`${requestUrl.origin}/auth/error?error=no_code`)
}
