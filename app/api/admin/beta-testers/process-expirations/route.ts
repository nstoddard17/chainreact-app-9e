import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  try {
    // Process expired beta testers
    const { data: expiredTesters, error: fetchError } = await supabase
      .from("beta_testers")
      .select("*")
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lt("expires_at", new Date().toISOString())

    if (fetchError) {
      throw fetchError
    }

    const processed = {
      expired: 0,
      downgraded: 0,
      offersSent: 0
    }

    for (const tester of expiredTesters || []) {
      // Update beta tester status
      await supabase
        .from("beta_testers")
        .update({
          status: "expired",
          updated_at: new Date().toISOString()
        })
        .eq("id", tester.id)

      processed.expired++

      // Find user and downgrade role
      const { data: user } = await supabase
        .from("auth.users")
        .select("id")
        .eq("email", tester.email)
        .single()

      if (user) {
        await supabase
          .from("profiles")
          .update({
            role: "free",
            updated_at: new Date().toISOString()
          })
          .eq("id", user.id)

        processed.downgraded++

        // Log activity
        await supabase
          .from("beta_tester_activity")
          .insert({
            beta_tester_id: tester.id,
            user_id: user.id,
            activity_type: "expired",
            activity_data: { automatic: true }
          })
      }

      // Send conversion offer email (integrate with your email service)
      if (!tester.conversion_offer_sent_at) {
        // This would integrate with your email service (SendGrid, etc.)
        // await sendConversionEmail(tester.email)

        await supabase
          .from("beta_testers")
          .update({
            conversion_offer_sent_at: new Date().toISOString()
          })
          .eq("id", tester.id)

        processed.offersSent++
      }
    }

    return NextResponse.json({
      success: true,
      processed
    })
  } catch (error: any) {
    console.error("Error processing beta expirations:", error)
    return NextResponse.json(
      { error: "Failed to process expirations", details: error.message },
      { status: 500 }
    )
  }
}