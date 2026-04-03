import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { getWaitlistForInvitation } from '@/lib/admin/waitlistActions'
import { sendWaitlistInvitationEmail } from '@/lib/services/resend'
import { logAdminAction } from '@/lib/utils/admin-audit'
import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin({ capabilities: ['support_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const body = await request.json()
    const { memberIds, sendToAll } = body

    const { data: members, error: fetchError, supabase: supabaseAdmin } = await getWaitlistForInvitation(
      memberIds,
      sendToAll
    )

    if (fetchError) {
      if ((fetchError as any).message === 'No members specified') {
        return errorResponse('No members specified', 400)
      }
      logger.error('Error fetching waitlist members:', fetchError)
      return errorResponse('Failed to fetch waitlist members', 500)
    }

    if (!members || members.length === 0 || !supabaseAdmin) {
      return jsonResponse({ message: 'No eligible waitlist members found' }, { status: 200 })
    }

    const emailPromises = members.map(async (member) => {
      const signupToken = Buffer.from(`${member.email}:${Date.now()}`).toString('base64')

      await supabaseAdmin
        .from('waitlist')
        .update({
          invitation_sent_at: new Date().toISOString(),
          signup_token: signupToken,
          status: 'invited',
        })
        .eq('id', member.id)

      const baseUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : process.env.NEXT_PUBLIC_APP_URL

      const signupUrl = `${baseUrl}/auth/signup?token=${signupToken}&email=${encodeURIComponent(member.email)}`

      try {
        const result = await sendWaitlistInvitationEmail(member.email, member.name, signupUrl)
        if (!result.success) {
          logger.error(`Failed to send invitation to waitlist member (ID: ${member.id}):`, result.error)
          logger.info(`Waitlist Invitation URL for ID ${member.id}: ${signupUrl}`)
        }
      } catch (emailError) {
        logger.error(`Failed to send invitation to waitlist member (ID: ${member.id}):`, emailError)
        logger.info(`Waitlist Invitation URL for ID ${member.id}: ${signupUrl}`)
      }
    })

    await Promise.all(emailPromises)

    await logAdminAction({
      userId: authResult.userId,
      action: 'waitlist_send_invitations',
      resourceType: 'waitlist',
      newValues: { count: members.length, sendToAll },
      request,
    })

    return jsonResponse({
      success: true,
      count: members.length,
      message: `Successfully sent invitations to ${members.length} waitlist member(s)`,
    })
  } catch (error: any) {
    logger.error('Error sending waitlist invitations:', error)
    return errorResponse(error.message, 500)
  }
}
