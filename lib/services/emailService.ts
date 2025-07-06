import { createClient } from '@supabase/supabase-js'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export class EmailService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  async sendInvitationEmail(
    email: string,
    organizationName: string,
    invitedByEmail: string,
    invitationToken: string,
    role: string
  ): Promise<boolean> {
    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/organizations/accept-invitation?token=${invitationToken}`
    
    const subject = `You've been invited to join ${organizationName} on ChainReact`
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Organization Invitation</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>You've been invited to join ${organizationName}</h2>
            </div>
            
            <p>Hello!</p>
            
            <p><strong>${invitedByEmail}</strong> has invited you to join <strong>${organizationName}</strong> on ChainReact as a <strong>${role}</strong>.</p>
            
            <p>ChainReact is a powerful workflow automation platform that helps teams collaborate and automate their processes.</p>
            
            <p>Click the button below to accept the invitation:</p>
            
            <a href="${acceptUrl}" class="button">Accept Invitation</a>
            
            <p>This invitation will expire in 7 days. If you have any questions, please contact the person who invited you.</p>
            
            <div class="footer">
              <p>This invitation was sent from ChainReact. If you didn't expect this email, you can safely ignore it.</p>
              <p>Invitation expires: ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
            </div>
          </div>
        </body>
      </html>
    `
    
    const text = `
      You've been invited to join ${organizationName}
      
      ${invitedByEmail} has invited you to join ${organizationName} on ChainReact as a ${role}.
      
      ChainReact is a powerful workflow automation platform that helps teams collaborate and automate their processes.
      
      Accept your invitation here: ${acceptUrl}
      
      This invitation will expire in 7 days. If you have any questions, please contact the person who invited you.
      
      This invitation was sent from ChainReact. If you didn't expect this email, you can safely ignore it.
    `

    return this.sendEmail({
      to: email,
      subject,
      html,
      text
    })
  }

  private async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      // For now, we'll use a simple console log to simulate email sending
      // In production, you would integrate with a service like SendGrid, AWS SES, or Resend
      console.log('Sending email:', {
        to: options.to,
        subject: options.subject,
        html: options.html.substring(0, 200) + '...',
        text: options.text?.substring(0, 200) + '...'
      })

      // TODO: Integrate with actual email service
      // Example with SendGrid:
      // const sgMail = require('@sendgrid/mail')
      // sgMail.setApiKey(process.env.SENDGRID_API_KEY)
      // await sgMail.send({
      //   to: options.to,
      //   from: process.env.FROM_EMAIL,
      //   subject: options.subject,
      //   html: options.html,
      //   text: options.text
      // })

      return true
    } catch (error) {
      console.error('Failed to send email:', error)
      return false
    }
  }
}

export const emailService = new EmailService() 