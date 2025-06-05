import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { eq } from "drizzle-orm"
import { integrations } from "@/lib/db/schema"
import { getSlackOAuthClient } from "@/lib/integrations/slack"
import { generateId } from "lucia"
import { validateAndUpdateIntegrationScopes } from "@/lib/integrations/scopeValidation"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.error("Slack OAuth error:", error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=${error}`)
  }

  if (!code || !state) {
    console.error("Missing code or state parameter")
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=missing_params`)
  }

  try {
    const slackOAuthClient = getSlackOAuthClient()
    const tokenData = await slackOAuthClient.getToken(code)

    if (!tokenData.ok) {
      console.error("Slack OAuth token error:", tokenData.error)
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=${tokenData.error}`)
    }

    const botToken = tokenData.bot_access_token
    const enterpriseId = tokenData.enterprise?.id || tokenData.team?.id
    const teamId = tokenData.team?.id
    const userId = tokenData.authed_user?.id
    const scopes = tokenData.scope

    if (!botToken || !enterpriseId || !teamId || !userId) {
      console.error("Missing required token data")
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=missing_token_data`)
    }

    let integrationId: string | undefined

    // Check if an integration already exists for this team
    const existingIntegration = await db.query.integrations.findFirst({
      where: (integrations, { eq }) => eq(integrations.teamId, teamId as string),
    })

    if (existingIntegration) {
      integrationId = existingIntegration.id
    }

    // After getting the token response and before updating the database
    const grantedScopes = tokenData.scope ? tokenData.scope.split(",") : []

    // Validate the scopes
    const validationResult = await validateAndUpdateIntegrationScopes(integrationId || generateId(21), grantedScopes)

    console.log("Slack scope validation result:", validationResult)

    if (existingIntegration) {
      // Update existing integration
      await db
        .update(integrations)
        .set({
          botToken: botToken,
          enterpriseId: enterpriseId,
          userId: userId,
          scopes: grantedScopes,
          verified: validationResult.valid,
          verifiedScopes: grantedScopes,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, existingIntegration.id))

      console.log(`Slack integration updated for team: ${teamId}`)
    } else {
      // Create a new integration
      const newIntegration = {
        id: generateId(21),
        teamId: teamId,
        enterpriseId: enterpriseId,
        userId: userId,
        botToken: botToken,
        type: "slack",
        scopes: grantedScopes,
        verified: validationResult.valid,
        verifiedScopes: grantedScopes,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.insert(integrations).values(newIntegration)

      console.log(`New Slack integration created for team: ${teamId}`)
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?success=slack_integration_added`)
  } catch (error: any) {
    console.error("Error during Slack OAuth flow:", error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=oauth_failed`)
  }
}
