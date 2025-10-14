import { executeAction } from "@/actions"
import { ACTION_METADATA as SEND_GMAIL_METADATA } from "@/integrations/gmail/sendEmail"

import { logger } from '@/lib/utils/logger'

/**
 * Example of sending an email using the Gmail action system
 */
async function sendEmailExample() {
  logger.debug("Starting Gmail send email example...")
  
  // User ID from your authentication system
  const userId = "user_123456" 
  
  // Execute the Gmail send email action
  const result = await executeAction(SEND_GMAIL_METADATA.key, {
    userId,
    
    // Configuration for the action
    config: {
      to: "recipient@example.com",
      subject: "Test email from ChainReact",
      body: "Hello {{input.name}},\n\nThis is a test email sent from ChainReact's action system.\n\nRegards,\nThe ChainReact Team",
      isHtml: false
    },
    
    // Dynamic input values
    input: {
      name: "John Doe",
      currentTime: new Date().toISOString()
    }
  })
  
  // Check the result
  if (result.success) {
    logger.debug("Email sent successfully!")
    logger.debug("Message ID:", result.output?.messageId)
    logger.debug("Thread ID:", result.output?.threadId)
  } else {
    logger.error("Failed to send email:", result.error)
  }
}

/**
 * Example of using templated values in email content
 */
async function sendTemplatedEmail(userId: string, customerName: string, orderNumber: string) {
  // Execute the Gmail send email action with templated values
  const result = await executeAction(SEND_GMAIL_METADATA.key, {
    userId,
    
    // Configuration with templates
    config: {
      to: "{{input.customerEmail}}",
      subject: "Your order #{{input.orderNumber}} has shipped!",
      body: `
        <h1>Order Shipped!</h1>
        <p>Hello {{input.customerName}},</p>
        <p>We're happy to inform you that your order #{{input.orderNumber}} has been shipped and is on its way!</p>
        <p>Expected delivery date: {{input.deliveryDate}}</p>
        <p>Thank you for shopping with us.</p>
        <p>Regards,<br>The ChainReact Team</p>
      `,
      isHtml: true
    },
    
    // Input data for template resolution
    input: {
      customerName,
      customerEmail: "customer@example.com",
      orderNumber,
      deliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString()
    }
  })
  
  return result
}

/**
 * Example of using the action with dynamic recipients
 */
async function sendBulkEmails(userId: string, recipients: Array<{name: string, email: string}>) {
  // Track results for each recipient
  const results = []
  
  for (const recipient of recipients) {
    // Execute the action for each recipient
    const result = await executeAction(SEND_GMAIL_METADATA.key, {
      userId,
      
      config: {
        to: recipient.email,
        subject: "Important announcement",
        body: `Hello ${recipient.name},\n\nThis is an important announcement for all customers.\n\nRegards,\nThe ChainReact Team`,
        isHtml: false
      },
      
      input: { recipient }
    })
    
    results.push({
      recipient,
      success: result.success,
      messageId: result.output?.messageId,
      error: result.error
    })
  }
  
  return results
}

// Export the examples
export { sendEmailExample, sendTemplatedEmail, sendBulkEmails } 