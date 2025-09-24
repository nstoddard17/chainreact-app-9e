import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { queueWebhookTask } from '@/lib/webhooks/task-queue'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'
import { google } from 'googleapis'
import { getDecryptedAccessToken } from '@/lib/workflows/actions/core/getDecryptedAccessToken'

interface GmailNotification {
  emailAddress: string
  historyId: string | number
}

export interface GmailWebhookEvent {
  eventData: any
  requestId: string
}

export async function processGmailEvent(event: GmailWebhookEvent): Promise<any> {
  try {
    console.log('🔍 [Gmail Processor] Processing Gmail event:', {
      eventType: event.eventData.type,
      emailAddress: event.eventData.emailAddress,
      historyId: event.eventData.historyId
    })

    const supabase = await createSupabaseServiceClient()

    // Store the webhook event in the database
    const { data: storedEvent, error: storeError } = await supabase
      .from('webhook_events')
      .insert({
        provider: 'gmail',
        service: 'gmail',
        event_data: event.eventData,
        request_id: event.requestId,
        status: 'received',
        timestamp: new Date().toISOString()
      })
      .select()
      .single()

    if (storeError) {
      console.error('Failed to store Gmail webhook event:', storeError)
    }

    // IMMEDIATELY trigger workflows that match this Gmail event
    await triggerMatchingGmailWorkflows(event)

    // Process Gmail event
    return await processGmailEventData(event)
  } catch (error) {
    console.error('Error processing Gmail webhook event:', error)
    throw error
  }
}

async function processGmailEventData(event: GmailWebhookEvent): Promise<any> {
  const { eventData } = event
  
  // Handle different Gmail event types
  switch (eventData.type) {
    case 'message.new':
      return await handleGmailNewMessage(eventData)
    case 'message.modified':
      return await handleGmailMessageModified(eventData)
    case 'message.deleted':
      return await handleGmailMessageDeleted(eventData)
    case 'label.added':
      return await handleGmailLabelAdded(eventData)
    case 'label.removed':
      return await handleGmailLabelRemoved(eventData)
    case 'attachment.added':
      return await handleGmailAttachmentAdded(eventData)
    default:
      console.log('Unhandled Gmail event type:', eventData.type)
      return { processed: true, eventType: eventData.type }
  }
}

// Gmail event handlers
async function handleGmailNewMessage(eventData: any): Promise<any> {
  console.log('Processing Gmail new message event')

  // Queue for background processing to fetch full message details
  await queueWebhookTask({
    provider: 'gmail',
    service: 'gmail',
    eventType: 'message.new',
    eventData,
    requestId: eventData.requestId
  })

  return {
    processed: true,
    type: 'gmail_new_message'
  }
}

async function handleGmailMessageModified(eventData: any): Promise<any> {
  console.log('Processing Gmail message modified:', eventData.message_id)
  return { 
    processed: true, 
    type: 'gmail_message_modified', 
    messageId: eventData.message_id 
  }
}

async function handleGmailMessageDeleted(eventData: any): Promise<any> {
  console.log('Processing Gmail message deleted:', eventData.message_id)
  return { 
    processed: true, 
    type: 'gmail_message_deleted', 
    messageId: eventData.message_id 
  }
}

async function handleGmailLabelAdded(eventData: any): Promise<any> {
  console.log('Processing Gmail label added:', eventData.label_id)
  return { 
    processed: true, 
    type: 'gmail_label_added', 
    labelId: eventData.label_id,
    messageId: eventData.message_id
  }
}

async function handleGmailLabelRemoved(eventData: any): Promise<any> {
  console.log('Processing Gmail label removed:', eventData.label_id)
  return { 
    processed: true, 
    type: 'gmail_label_removed', 
    labelId: eventData.label_id,
    messageId: eventData.message_id
  }
}

async function handleGmailAttachmentAdded(eventData: any): Promise<any> {
  console.log('Processing Gmail attachment added:', eventData.attachment_id)
  return { 
    processed: true, 
    type: 'gmail_attachment_added', 
    attachmentId: eventData.attachment_id,
    messageId: eventData.message_id
  }
}

async function fetchEmailDetails(
  notification: GmailNotification,
  userId: string,
  webhookConfigId: string,
  webhookConfigData: any
): Promise<any | null> {
  try {
    console.log(`🔍 Fetching email details for historyId: ${notification.historyId}`)
    const accessToken = await getDecryptedAccessToken(userId, "gmail")

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    const watchConfig = webhookConfigData.watch || {}

    if (watchConfig.emailAddress && watchConfig.emailAddress !== notification.emailAddress) {
      console.log('⚠️ Gmail notification email does not match workflow configuration, skipping')
      return null
    }

    const startHistoryId = watchConfig.historyId

    if (!startHistoryId) {
      console.warn('⚠️ No stored historyId for Gmail watch; using notification historyId - 1')
    }

    const historyRequest: any = {
      userId: 'me',
      historyTypes: ['messageAdded'],
      startHistoryId: startHistoryId
        ? startHistoryId
        : (parseInt(String(notification.historyId)) - 1).toString()
    }

    const history = await gmail.users.history.list(historyRequest)

    console.log(`📚 History response:`, {
      historyLength: history.data.history?.length || 0
    })

    if (!history.data.history || history.data.history.length === 0) {
      console.log('No new messages in history')
      return null
    }

    const messageId = history.data.history
      ?.flatMap(entry => entry.messagesAdded || entry.messages || [])
      ?.map(entry => entry.message || entry)
      ?.find(msg => msg?.id)?.id

    if (!messageId) {
      console.log('No message ID found in history')
      return null
    }

    console.log(`📧 Found message ID: ${messageId}`)

    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    })

    const supabase = await createSupabaseServiceClient()

    await supabase
      .from('webhook_configs')
      .update({
        config: {
          ...webhookConfigData,
          watch: {
            ...watchConfig,
            historyId: String(notification.historyId)
          }
        }
      })
      .eq('id', webhookConfigId)

    const headers = message.data.payload?.headers || []
    const emailDetails: any = {
      id: message.data.id,
      threadId: message.data.threadId,
      labelIds: message.data.labelIds,
      snippet: message.data.snippet
    }

    headers.forEach((header: any) => {
      const name = header.name.toLowerCase()
      if (name === 'from') emailDetails.from = header.value
      if (name === 'to') emailDetails.to = header.value
      if (name === 'subject') emailDetails.subject = header.value
      if (name === 'date') emailDetails.date = header.value
    })

    emailDetails.hasAttachments = false
    if (message.data.payload?.parts) {
      emailDetails.hasAttachments = message.data.payload.parts.some(
        (part: any) => part.filename && part.filename.length > 0
      )
    }

    let body = ''
    if (message.data.payload?.parts) {
      for (const part of message.data.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8')
        }
      }
    } else if (message.data.payload?.body?.data) {
      body = Buffer.from(message.data.payload.body.data, 'base64').toString('utf-8')
    }
    emailDetails.body = body

    console.log('📧 Fetched email details:', {
      from: emailDetails.from,
      subject: emailDetails.subject,
      hasAttachments: emailDetails.hasAttachments
    })

    return emailDetails
  } catch (error) {
    console.error('Failed to fetch email details:', error)
    return null
  }
}

async function checkEmailMatchesFilters(email: any, filters: any): Promise<boolean> {
  console.log('🔍 Checking email against filters:', {
    email: { from: email.from, subject: email.subject, hasAttachments: email.hasAttachments },
    filters: filters
  })

  // Check sender filter
  if (filters.from && filters.from.trim() !== '') {
    const senderFilter = filters.from.toLowerCase().trim()
    const emailFrom = (email.from || '').toLowerCase()

    // Extract email address from "Name <email@domain.com>" format if needed
    const emailMatch = emailFrom.match(/<(.+?)>/)
    const emailAddress = emailMatch ? emailMatch[1] : emailFrom

    if (!emailAddress.includes(senderFilter)) {
      console.log(`❌ Sender filter mismatch: "${emailAddress}" doesn't contain "${senderFilter}"`)
      return false
    }
    console.log(`✅ Sender filter matched: "${emailAddress}" contains "${senderFilter}"`)
  }

  // Check subject filter
  if (filters.subject && filters.subject.trim() !== '') {
    const subjectFilter = filters.subject.toLowerCase().trim()
    const emailSubject = (email.subject || '').toLowerCase()

    if (!emailSubject.includes(subjectFilter)) {
      console.log(`❌ Subject filter mismatch: "${emailSubject}" doesn't contain "${subjectFilter}"`)
      return false
    }
    console.log(`✅ Subject filter matched: "${emailSubject}" contains "${subjectFilter}"`)
  }

  // Check attachment filter
  if (filters.hasAttachment && filters.hasAttachment !== 'any') {
    const shouldHaveAttachment = filters.hasAttachment === 'yes'
    if (email.hasAttachments !== shouldHaveAttachment) {
      console.log(`❌ Attachment filter mismatch: email has attachments=${email.hasAttachments}, filter expects=${shouldHaveAttachment}`)
      return false
    }
    console.log(`✅ Attachment filter matched: ${shouldHaveAttachment ? 'has' : 'no'} attachments`)
  }

  console.log('✅ All filters matched!')
  return true
}

async function triggerMatchingGmailWorkflows(event: GmailWebhookEvent): Promise<void> {
  try {
    console.log('🚀 [Gmail Processor] Starting to find matching workflows for Gmail event')
    const supabase = await createSupabaseServiceClient()

    // Find all active workflows with Gmail webhook triggers
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select(`
        id,
        user_id,
        nodes,
        name
      `)
      .eq('status', 'active')
      .not('nodes', 'is', null)

    if (error) {
      console.error('Failed to fetch workflows:', error)
      return
    }

    if (!workflows) return

    // Process each workflow
    for (const workflow of workflows) {
      const nodes = workflow.nodes || []

      // Find Gmail trigger nodes
      const gmailTriggerNodes = nodes.filter((node: any) => {
        const isGmailTrigger =
          node.data?.type === 'gmail_trigger_new_email' ||
          node.data?.nodeType === 'gmail_trigger_new_email' ||
          node.type === 'gmail_trigger_new_email' ||
          node.data?.providerId === 'gmail'

        return node.data?.isTrigger && isGmailTrigger
      })

      if (gmailTriggerNodes.length === 0) continue

      console.log(`[Gmail Processor] Found ${gmailTriggerNodes.length} Gmail trigger(s) in workflow ${workflow.id}`)

      // Fetch the actual email details
      const emailDetails = await fetchEmailDetails(
        {
          historyId: event.eventData.historyId,
          emailAddress: event.eventData.emailAddress
        },
        workflow.user_id,
        webhookConfig.id,
        webhookConfig.config || {}
      )

      if (!emailDetails) {
        console.log('Could not fetch email details, skipping workflow')
        continue
      }

      // Check if email matches any trigger's filters
      let matchFound = false
      for (const triggerNode of gmailTriggerNodes) {
        const filters = triggerNode.data?.config || {}

        console.log(`Checking trigger node ${triggerNode.id} filters:`, filters)

        if (await checkEmailMatchesFilters(emailDetails, filters)) {
          matchFound = true
          break
        }
      }

      if (!matchFound) {
        console.log(`❌ Email doesn't match filters for workflow ${workflow.id}`)
        continue
      }

      // Email matches filters - trigger the workflow
      try {
        console.log(`🎯 Triggering workflow: "${workflow.name}" (${workflow.id})`)

        const executionEngine = new AdvancedExecutionEngine()
        const executionSession = await executionEngine.createExecutionSession(
          workflow.id,
          workflow.user_id,
          'webhook',
          {
            inputData: {
              ...event.eventData,
              emailDetails: emailDetails
            },
            webhookEvent: event
          }
        )

        // Execute the workflow asynchronously (don't wait for completion)
        executionEngine.executeWorkflowAdvanced(executionSession.id, {
          ...event.eventData,
          emailDetails: emailDetails
        })

        console.log(`✅ Successfully triggered workflow ${workflow.name} (${workflow.id}) with session ${executionSession.id}`)
      } catch (workflowError) {
        console.error(`Failed to trigger workflow ${workflow.id}:`, workflowError)
      }
    }
  } catch (error) {
    console.error('Error triggering matching Gmail workflows:', error)
  }
} 
