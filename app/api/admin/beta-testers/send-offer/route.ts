import { createSupabaseServiceClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import { sendBetaInvitationEmail } from '@/lib/services/resend'

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
      return NextResponse.json({ error: "No testers specified" }, { status: 400 })
    }

    const { data: testers, error: fetchError } = await query

    if (fetchError) {
      console.error("Error fetching beta testers:", fetchError)
      return NextResponse.json({ error: "Failed to fetch beta testers" }, { status: 500 })
    }

    if (!testers || testers.length === 0) {
      return NextResponse.json({ message: "No eligible beta testers found" }, { status: 200 })
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
          console.error(`Failed to send email to beta tester (ID: ${tester.id}):`, result.error)
          // Log the signup URL as fallback
          console.log(`Beta Tester Invitation URL for ID ${tester.id}:`)
          console.log(`Signup URL: ${signupUrl}`)
        }
      } catch (emailError) {
        console.error(`Failed to send email to beta tester (ID: ${tester.id}):`, emailError)
        // Log the signup URL as fallback
        console.log(`Beta Tester Invitation URL for ID ${tester.id}:`)
        console.log(`Signup URL: ${signupUrl}`)
      }
    })

    await Promise.all(emailPromises)

    return NextResponse.json({
      success: true,
      count: testers.length,
      message: `Successfully sent offers to ${testers.length} beta tester(s)`
    })

  } catch (error: any) {
    console.error("Error sending beta offers:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}