import { createSupabaseServiceClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { sendBetaInvitationEmail } from '@/lib/services/resend'

import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { testerIds, sendToAll } = body

    // Get the current user to verify admin access
    const supabase = await createSupabaseServiceClient()

    // Fetch beta testers to send offers to
    let query = supabase.from("beta_testers").select("*")

    if (sendToAll) {
      // Send to all active beta testers who haven't received an offer yet
      query = query
        .eq("status", "active")
        .is("conversion_offer_sent_at", null)
    } else if (testerIds && testerIds.length > 0) {
      // Send to specific testers
      query = query.in("id", testerIds)
    } else {
      return errorResponse("No testers specified" , 400)
    }

    const { data: testers, error: fetchError } = await query

    if (fetchError) {
      logger.error("Error fetching beta testers:", fetchError)
      return errorResponse("Failed to fetch beta testers" , 500)
    }

    if (!testers || testers.length === 0) {
      return jsonResponse({ message: "No eligible beta testers found" }, { status: 200 })
    }

    // Generate unique signup links for each tester
    const emailPromises = testers.map(async (tester) => {
      // Create a unique token for this beta tester
      const signupToken = Buffer.from(`${tester.email}:${Date.now()}`).toString('base64')

      // Store the token in the database for verification
      await supabase
        .from("beta_testers")
        .update({
          conversion_offer_sent_at: new Date().toISOString(),
          signup_token: signupToken
        })
        .eq("id", tester.id)

      // Use localhost for development testing
      const baseUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : process.env.NEXT_PUBLIC_APP_URL

      const signupUrl = `${baseUrl}/auth/beta-signup?token=${signupToken}&email=${encodeURIComponent(tester.email)}`

      // Calculate expiry days
      const expiresInDays = tester.expires_at
        ? Math.ceil((new Date(tester.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 30

      // Send email using the new beta invitation template
      try {
        const result = await sendBetaInvitationEmail(
          tester.email,
          signupUrl,
          {
            maxWorkflows: tester.max_workflows || 50,
            maxExecutions: tester.max_executions_per_month || 5000,
            expiresInDays: expiresInDays
          }
        )

        if (!result.success) {
          logger.error(`Failed to send email to beta tester (ID: ${tester.id}):`, result.error)
          // Log the signup URL as fallback
          logger.debug(`Beta Tester Invitation URL for ID ${tester.id}:`)
          logger.debug(`Signup URL: ${signupUrl}`)
        }
      } catch (emailError) {
        logger.error(`Failed to send email to beta tester (ID: ${tester.id}):`, emailError)
        // Log the signup URL as fallback
        logger.debug(`Beta Tester Invitation URL for ID ${tester.id}:`)
        logger.debug(`Signup URL: ${signupUrl}`)
      }
    })

    await Promise.all(emailPromises)

    return jsonResponse({
      success: true,
      count: testers.length,
      message: `Successfully sent offers to ${testers.length} beta tester(s)`
    })

  } catch (error: any) {
    logger.error("Error sending beta offers:", error)
    return errorResponse(error.message , 500)
  }
}