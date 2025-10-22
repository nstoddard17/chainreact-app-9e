/**
 * Email Notification Service using Resend
 */

import { Resend } from 'resend'
import { logger } from '@/lib/utils/logger'

const resend = new Resend(process.env.RESEND_API_KEY)

interface EmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

/**
 * Send email notification
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<boolean> {
  try {
    // Validate environment
    if (!process.env.RESEND_API_KEY) {
      logger.error('Resend API key not configured')
      return false
    }

    // Validate email
    if (!to || !to.includes('@')) {
      logger.error('Invalid email address:', to)
      return false
    }

    // Send email
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'ChainReact <notifications@chainreact.app>',
      to: [to],
      subject,
      text,
      html: html || generateErrorEmailHTML(subject, text),
    })

    logger.info('Email sent successfully:', {
      to,
      subject,
      id: result.data?.id
    })

    return true
  } catch (error: any) {
    logger.error('Failed to send email:', {
      error: error.message,
      to,
      subject
    })
    return false
  }
}

/**
 * Generate HTML email template for errors
 */
function generateErrorEmailHTML(subject: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Workflow Error Alert</h1>
  </div>

  <div style="background: #f8f9fa; padding: 30px; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 10px 10px;">
    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #dc3545;">
      <pre style="white-space: pre-wrap; word-wrap: break-word; background: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 13px; margin: 0;">${body}</pre>
    </div>

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; text-align: center;">
      <p style="color: #6c757d; font-size: 12px; margin: 0;">
        This is an automated notification from ChainReact
      </p>
      <p style="color: #6c757d; font-size: 12px; margin: 5px 0 0 0;">
        <a href="https://chainreact.app/workflows" style="color: #667eea; text-decoration: none;">View Workflow →</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Send workflow error email with formatted details
 */
export async function sendWorkflowErrorEmail(
  to: string,
  workflowName: string,
  workflowId: string,
  error: string,
  executionId?: string
): Promise<boolean> {
  const subject = `Workflow Failed: ${workflowName}`

  const text = `
Workflow "${workflowName}" encountered an error

Error Details:
${error}

Workflow ID: ${workflowId}
${executionId ? `Execution ID: ${executionId}` : ''}
Time: ${new Date().toLocaleString()}

View this workflow: https://chainreact.app/workflows/builder/${workflowId}
  `.trim()

  return sendEmail(to, subject, text)
}
