import { Resend } from 'resend'
import { render } from '@react-email/render'
import WelcomeEmail from '../../emails/welcome'
import PasswordResetEmail from '../../emails/password-reset'
import BetaInvitationEmail from '../../emails/beta-invitation'
import WaitlistWelcomeEmail from '../../emails/waitlist-welcome'
import WaitlistInvitationEmail from '../../emails/waitlist-invitation'
import TeamInvitationEmail from '../../emails/team-invitation'
import IntegrationDisconnectedEmail from '../../emails/integration-disconnected'

import { logger } from '@/lib/utils/logger'

let cachedResendClient: Resend | null = null

// Lazy-load Resend client to avoid build-time env var requirement
export function getResendClient(): Resend | null {
  if (cachedResendClient) {
    return cachedResendClient
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    logger.warn('[Resend] RESEND_API_KEY is not configured; email delivery is disabled')
    return null
  }

  cachedResendClient = new Resend(apiKey)
  return cachedResendClient
}

export const resend = {
  get client() {
    return getResendClient()
  }
}

function emailServiceDisabledResult() {
  return { success: false, error: 'Email service is not configured' }
}

export interface EmailOptions {
  to: string | string[]
  subject: string
  from?: string
}

export interface WelcomeEmailData {
  username?: string
  confirmationUrl: string
}

export interface PasswordResetEmailData {
  username?: string
  resetUrl: string
}

/**
 * Send welcome/confirmation email
 */
export async function sendWelcomeEmail(
  options: EmailOptions,
  data: WelcomeEmailData
) {
  try {
    const emailHtml = await render(WelcomeEmail(data))
    const client = getResendClient()
    if (!client) {
      return emailServiceDisabledResult()
    }

    const result = await client.emails.send({
      from: options.from || 'ChainReact <noreply@chainreact.app>',
      to: options.to,
      subject: options.subject,
      html: emailHtml,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High', 
        'Importance': 'high',
        'X-Mailer': 'ChainReact',
        'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN',
        'List-Unsubscribe': '<mailto:unsubscribe@chainreact.app>',
      },
    })

    logger.debug('Welcome email sent successfully:', result.data?.id)
    return { success: true, id: result.data?.id }
  } catch (error) {
    logger.error('Error sending welcome email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  options: EmailOptions,
  data: PasswordResetEmailData
) {
  try {
    const emailHtml = await render(PasswordResetEmail(data))
    const client = getResendClient()
    if (!client) {
      return emailServiceDisabledResult()
    }

    const result = await client.emails.send({
      from: options.from || 'ChainReact <noreply@chainreact.app>',
      to: options.to,
      subject: options.subject,
      html: emailHtml,
    })

    logger.debug('Password reset email sent successfully:', result.data?.id)
    return { success: true, id: result.data?.id }
  } catch (error) {
    logger.error('Error sending password reset email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send custom email for workflow automations
 */
export async function sendCustomEmail(
  options: EmailOptions & {
    html?: string
    text?: string
    attachments?: Array<{
      filename: string
      content: Buffer | string
      contentType?: string
    }>
  }
) {
  try {
    const client = getResendClient()
    if (!client) {
      return emailServiceDisabledResult()
    }

    const result = await client.emails.send({
      from: options.from || 'ChainReact <noreply@chainreact.app>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    })

    logger.debug('Custom email sent successfully:', result.data?.id)
    return { success: true, id: result.data?.id }
  } catch (error) {
    logger.error('Error sending custom email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Get email analytics
 */
export async function getEmailAnalytics(emailId: string) {
  try {
    // Note: Resend analytics API is still in development
    // This is a placeholder for when it becomes available
    logger.debug('Fetching analytics for email:', emailId)
    return { success: true, data: null }
  } catch (error) {
    logger.error('Error fetching email analytics:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Validate email address
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Send bulk emails (for marketing or notifications)
 */
export async function sendBulkEmails(
  emails: Array<{
    to: string
    subject: string
    html?: string
    text?: string
  }>,
  from?: string
) {
  try {
    const client = getResendClient()
    if (!client) {
      return emailServiceDisabledResult()
    }

    const results = await Promise.allSettled(
      emails.map(email =>
        client.emails.send({
          from: from || 'ChainReact <noreply@chainreact.app>',
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        })
      )
    )

    const successful = results.filter(result => result.status === 'fulfilled').length
    const failed = results.filter(result => result.status === 'rejected').length

    logger.debug(`Bulk email results: ${successful} successful, ${failed} failed`)
    return { success: true, successful, failed, results }
  } catch (error) {
    logger.error('Error sending bulk emails:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send beta tester invitation email
 */
export async function sendBetaInvitationEmail(
  email: string,
  signupUrl: string,
  testerData: {
    maxWorkflows?: number
    maxExecutions?: number
    expiresInDays?: number
  }
) {
  try {
    const emailHtml = await render(BetaInvitationEmail({
      email,
      signupUrl,
      maxWorkflows: testerData.maxWorkflows || 50,
      maxExecutions: testerData.maxExecutions || 5000,
      expiresInDays: testerData.expiresInDays || 30,
    }))

    const client = getResendClient()
    if (!client) {
      return emailServiceDisabledResult()
    }

    const result = await client.emails.send({
      from: 'ChainReact <noreply@chainreact.app>',
      to: email,
      subject: '🚀 Your Exclusive ChainReact Beta Access Awaits!',
      html: emailHtml,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'ChainReact Beta Program',
      },
    })

    logger.debug('Beta invitation email sent successfully:', result.data?.id)
    return { success: true, id: result.data?.id }
  } catch (error) {
    logger.error('Error sending beta invitation email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send waitlist welcome email
 */
export async function sendWaitlistWelcomeEmail(
  email: string,
  name: string
) {
  try {
    const emailHtml = await render(WaitlistWelcomeEmail({ name }))

    const client = getResendClient()
    if (!client) {
      return emailServiceDisabledResult()
    }

    const result = await client.emails.send({
      from: 'ChainReact <noreply@chainreact.app>',
      to: email,
      subject: "You're on the ChainReact Waitlist! 🎉",
      html: emailHtml,
      headers: {
        'X-Mailer': 'ChainReact Waitlist',
        'List-Unsubscribe': '<mailto:unsubscribe@chainreact.app>',
      },
    })

    logger.debug('Waitlist welcome email sent successfully:', result.data?.id)
    return { success: true, id: result.data?.id }
  } catch (error) {
    logger.error('Error sending waitlist welcome email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send waitlist member invitation to join the app
 */
export async function sendWaitlistInvitationEmail(
  email: string,
  name: string,
  signupUrl: string
) {
  try {
    const emailHtml = await render(WaitlistInvitationEmail({
      email,
      name,
      signupUrl,
    }))

    const client = getResendClient()
    if (!client) {
      return emailServiceDisabledResult()
    }

    const result = await client.emails.send({
      from: 'ChainReact <noreply@chainreact.app>',
      to: email,
      subject: '🎉 Your ChainReact Access is Ready!',
      html: emailHtml,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'ChainReact Waitlist',
      },
    })

    logger.debug('Waitlist invitation email sent successfully:', result.data?.id)
    return { success: true, id: result.data?.id }
  } catch (error) {
    logger.error('Error sending waitlist invitation email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send team invitation email
 */
export async function sendTeamInvitationEmail(
  inviteeEmail: string,
  inviteeName: string,
  inviterName: string,
  inviterEmail: string,
  teamName: string,
  role: string,
  acceptUrl: string,
  expiresAt: string
) {
  try {
    const emailHtml = await render(TeamInvitationEmail({
      inviteeName,
      inviterName,
      inviterEmail,
      teamName,
      role,
      acceptUrl,
      expiresAt,
    }))

    const client = getResendClient()
    if (!client) {
      return emailServiceDisabledResult()
    }

    const result = await client.emails.send({
      from: 'ChainReact <noreply@chainreact.app>',
      to: inviteeEmail,
      subject: `${inviterName} invited you to join ${teamName} on ChainReact`,
      html: emailHtml,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'ChainReact Teams',
      },
      replyTo: inviterEmail,
    })

    logger.debug('Team invitation email sent successfully:', result.data?.id)
    return { success: true, id: result.data?.id }
  } catch (error) {
    logger.error('Error sending team invitation email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Send integration disconnection email
 */
export async function sendIntegrationDisconnectedEmail(
  userEmail: string,
  userName: string,
  providerName: string,
  reconnectUrl: string,
  disconnectReason?: string,
  consecutiveFailures?: number
) {
  try {
    const emailHtml = await render(IntegrationDisconnectedEmail({
      userName,
      providerName,
      reconnectUrl,
      disconnectReason,
      consecutiveFailures,
    }))

    const client = getResendClient()
    if (!client) {
      return emailServiceDisabledResult()
    }

    const result = await client.emails.send({
      from: 'ChainReact <noreply@chainreact.app>',
      to: userEmail,
      subject: `🔴 Action Required: ${providerName} Integration Disconnected`,
      html: emailHtml,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'ChainReact Integrations',
      },
    })

    logger.debug('Integration disconnection email sent successfully:', result.data?.id)
    return { success: true, id: result.data?.id }
  } catch (error) {
    logger.error('Error sending integration disconnection email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
