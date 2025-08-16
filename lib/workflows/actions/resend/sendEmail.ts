import { sendCustomEmail, validateEmail } from '@/lib/services/resend'
import type { WorkflowExecution } from '@/lib/workflows/types'

export interface ResendEmailConfig {
  to: string
  subject: string
  html?: string
  text?: string
  from?: string
  attachments?: Array<{
    filename: string
    content: string
    contentType?: string
  }>
}

export async function sendEmail(
  config: ResendEmailConfig,
  variables: Record<string, any>,
  execution: WorkflowExecution
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Resolve variables in configuration
    const resolvedConfig = {
      to: resolveVariables(config.to, variables),
      subject: resolveVariables(config.subject, variables),
      html: config.html ? resolveVariables(config.html, variables) : undefined,
      text: config.text ? resolveVariables(config.text, variables) : undefined,
      from: config.from,
      attachments: config.attachments,
    }

    // Validate email addresses
    const recipients = Array.isArray(resolvedConfig.to) ? resolvedConfig.to : [resolvedConfig.to]
    for (const email of recipients) {
      if (!validateEmail(email)) {
        return {
          success: false,
          error: `Invalid email address: ${email}`
        }
      }
    }

    // Validate that we have content
    if (!resolvedConfig.html && !resolvedConfig.text) {
      return {
        success: false,
        error: 'Email must have either HTML or text content'
      }
    }

    // Send email via Resend
    const result = await sendCustomEmail(resolvedConfig)

    if (!result.success) {
      return {
        success: false,
        error: result.error
      }
    }

    return {
      success: true,
      data: {
        emailId: result.id,
        recipients: recipients,
        subject: resolvedConfig.subject,
        sentAt: new Date().toISOString(),
      }
    }

  } catch (error) {
    console.error('Error in Resend sendEmail action:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Resolve variables in a string template
 * Supports {{variable}} syntax
 */
function resolveVariables(template: string, variables: Record<string, any>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, variableName) => {
    const trimmedName = variableName.trim()
    const value = variables[trimmedName]
    
    if (value === undefined || value === null) {
      console.warn(`Variable "${trimmedName}" not found in context`)
      return match // Return original placeholder if variable not found
    }
    
    return String(value)
  })
}

export const resendEmailAction = {
  id: 'resend_send_email',
  name: 'Send Email (Resend)',
  description: 'Send an email using Resend service',
  category: 'communication',
  icon: 'Mail',
  inputs: [
    {
      id: 'to',
      name: 'To',
      type: 'text',
      required: true,
      placeholder: 'recipient@example.com or {{email_variable}}',
      description: 'Email recipient(s). Use variables like {{email}} for dynamic content.',
    },
    {
      id: 'subject',
      name: 'Subject',
      type: 'text',
      required: true,
      placeholder: 'Email subject or {{subject_variable}}',
      description: 'Email subject line. Supports variable substitution.',
    },
    {
      id: 'html',
      name: 'HTML Content',
      type: 'textarea',
      required: false,
      placeholder: '<h1>Hello {{name}}</h1><p>Your message here...</p>',
      description: 'HTML email content. Supports variable substitution.',
    },
    {
      id: 'text',
      name: 'Text Content',
      type: 'textarea',
      required: false,
      placeholder: 'Hello {{name}}, your message here...',
      description: 'Plain text email content. Supports variable substitution.',
    },
    {
      id: 'from',
      name: 'From Address',
      type: 'text',
      required: false,
      placeholder: 'ChainReact <noreply@chainreact.app>',
      description: 'Custom from address (optional). Must be verified domain.',
    },
  ],
  outputs: [
    {
      id: 'emailId',
      name: 'Email ID',
      type: 'string',
      description: 'Unique identifier for the sent email',
    },
    {
      id: 'recipients',
      name: 'Recipients',
      type: 'array',
      description: 'List of email recipients',
    },
    {
      id: 'subject',
      name: 'Subject',
      type: 'string',
      description: 'Email subject that was sent',
    },
    {
      id: 'sentAt',
      name: 'Sent At',
      type: 'string',
      description: 'Timestamp when email was sent',
    },
  ],
  execute: sendEmail,
}