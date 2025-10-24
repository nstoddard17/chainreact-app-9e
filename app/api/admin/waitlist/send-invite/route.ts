import { createSupabaseServiceClient, createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { sendWaitlistInvitationEmail } from '@/lib/services/resend'
import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { memberIds, sendToAll } = body

    // Create route handler client for auth verification
    const supabase = await createSupabaseRouteHandlerClient()

    // Get the current user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.error("Auth error:", authError)
      return errorResponse("Unauthorized - please log in", 401)
    }

    // Create service client to bypass RLS
    const supabaseAdmin = await createSupabaseServiceClient()

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("admin")
      .eq("id", user.id)
      .single()

    if (profileError) {
      logger.error("Error fetching profile:", profileError)
      return errorResponse("Failed to verify admin status", 500)
    }

    if (!profile || profile.admin !== true) {
      return jsonResponse(
        { error: `Only admins can send invitations.` },
        { status: 403 }
      )
    }

    // Fetch waitlist members to send invitations to
    let query = supabaseAdmin.from("waitlist").select("*")

    if (sendToAll) {
      // Send to all pending members who haven't received an invitation yet
      query = query
        .eq("status", "pending")
        .is("invitation_sent_at", null)
    } else if (memberIds && memberIds.length > 0) {
      // Send to specific members
      query = query.in("id", memberIds)
    } else {
      return errorResponse("No members specified", 400)
    }

    const { data: members, error: fetchError } = await query

    if (fetchError) {
      logger.error("Error fetching waitlist members:", fetchError)
      return errorResponse("Failed to fetch waitlist members", 500)
    }

    if (!members || members.length === 0) {
      return jsonResponse({ message: "No eligible waitlist members found" }, { status: 200 })
    }

    // Generate unique signup links for each member
    const emailPromises = members.map(async (member) => {
      // Create a unique token for this waitlist member
      const signupToken = Buffer.from(`${member.email}:${Date.now()}`).toString('base64')

      // Store the token in the database for verification
      await supabaseAdmin
        .from("waitlist")
        .update({
          invitation_sent_at: new Date().toISOString(),
          signup_token: signupToken,
          status: 'invited'
        })
        .eq("id", member.id)

      // Use localhost for development testing
      const baseUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : process.env.NEXT_PUBLIC_APP_URL

      const signupUrl = `${baseUrl}/auth/signup?token=${signupToken}&email=${encodeURIComponent(member.email)}`

      // Send email using the waitlist invitation template
      try {
        const result = await sendWaitlistInvitationEmail(
          member.email,
          member.name,
          signupUrl
        )

        if (!result.success) {
          logger.error(`Failed to send invitation email to waitlist member (ID: ${member.id}):`, result.error)
          // Log the signup URL as fallback
          logger.debug(`Waitlist Invitation URL for ID ${member.id}:`)
          logger.debug(`Signup URL: ${signupUrl}`)
        }
      } catch (emailError) {
        logger.error(`Failed to send invitation email to waitlist member (ID: ${member.id}):`, emailError)
        // Log the signup URL as fallback
        logger.debug(`Waitlist Invitation URL for ID ${member.id}:`)
        logger.debug(`Signup URL: ${signupUrl}`)
      }
    })

    await Promise.all(emailPromises)

    return jsonResponse({
      success: true,
      count: members.length,
      message: `Successfully sent invitations to ${members.length} waitlist member(s)`
    })

  } catch (error: any) {
    logger.error("Error sending waitlist invitations:", error)
    return errorResponse(error.message, 500)
  }
}
