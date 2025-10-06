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

const processedGmailEvents = new Map<string, number>()
const GMAIL_DEDUPE_WINDOW_MS = 5 * 60 * 1000

type GmailTriggerFilters = {
  from: string[]
  subject: string
  hasAttachment: 'any' | 'yes' | 'no'
}

function buildGmailDedupeKey(workflowId: string, dedupeId: string) {
  return `${workflowId}-${dedupeId}`
}

function wasRecentlyProcessedGmail(workflowId: string, dedupeId: string): boolean {
  const key = buildGmailDedupeKey(workflowId, dedupeId)
  const processedAt = processedGmailEvents.get(key)
  if (!processedAt) return false

  if (Date.now() - processedAt < GMAIL_DEDUPE_WINDOW_MS) {
    return true
  }

  processedGmailEvents.delete(key)
  return false
}

function markGmailEventProcessed(workflowId: string, dedupeId: string) {
  const key = buildGmailDedupeKey(workflowId, dedupeId)
  processedGmailEvents.set(key, Date.now())

  if (processedGmailEvents.size > 1000) {
    const now = Date.now()
    for (const [k, timestamp] of processedGmailEvents.entries()) {
      if (now - timestamp > GMAIL_DEDUPE_WINDOW_MS) {
        processedGmailEvents.delete(k)
      }
    }
  }
}

function normalizeEmailString(value: string) {
  return value.trim().toLowerCase()
}

function normalizeFromFilters(rawConfig: any, savedOptions: any): string[] {
  const candidates: string[] = []

  const rawFrom = rawConfig?.from ?? rawConfig?.filters?.from ?? rawConfig?.sender

  if (Array.isArray(rawFrom)) {
    for (const entry of rawFrom) {
      if (!entry) continue
      if (typeof entry === 'string') {
        candidates.push(entry)
      } else if (typeof entry === 'object') {
        const value = entry?.value ?? entry?.email ?? entry?.address ?? entry?.label
        if (value) candidates.push(String(value))
      }
    }
  } else if (typeof rawFrom === 'object' && rawFrom !== null) {
    const value = rawFrom?.value ?? rawFrom?.email ?? rawFrom?.address ?? rawFrom?.label
    if (value) candidates.push(String(value))
  } else if (typeof rawFrom === 'string' && rawFrom.trim() !== '') {
    candidates.push(...rawFrom.split(',').map((token) => token.trim()).filter(Boolean))
  }

  if (candidates.length === 0) {
    const saved = savedOptions?.from
    if (Array.isArray(saved)) {
      for (const entry of saved) {
        if (!entry) continue
        if (typeof entry === 'string') {
          candidates.push(entry)
        } else if (typeof entry === 'object') {
          const value = entry?.value ?? entry?.email ?? entry?.address ?? entry?.label
          if (value) candidates.push(String(value))
        }
      }
    } else if (typeof saved === 'string' && saved.trim() !== '') {
      candidates.push(...saved.split(',').map((token) => token.trim()).filter(Boolean))
    }
  }

  const normalized = candidates
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  return Array.from(new Set(normalized))
}

function normalizeSubjectFilter(rawConfig: any): string {
  const subject = rawConfig?.subject ?? rawConfig?.filters?.subject ?? ''
  if (typeof subject === 'string') {
    return subject.trim()
  }
  return ''
}

function normalizeAttachmentFilter(rawConfig: any): 'any' | 'yes' | 'no' {
  const value = rawConfig?.hasAttachment ?? rawConfig?.filters?.hasAttachment
  if (value === 'yes' || value === 'no') return value
  return 'any'
}

function resolveGmailTriggerFilters(triggerNode: any): GmailTriggerFilters {
  const rawConfig = triggerNode?.data?.config || {}
  const savedOptions = triggerNode?.data?.savedDynamicOptions || triggerNode?.data?.savedOptions || {}

  return {
    from: normalizeFromFilters(rawConfig, savedOptions),
    subject: normalizeSubjectFilter(rawConfig),
    hasAttachment: normalizeAttachmentFilter(rawConfig)
  }
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
    case 'gmail_new_email':
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
      console.warn('⚠️ No stored historyId for Gmail watch; skipping workflow until watch metadata saved')
      return null
    }

    const historyRequest: any = {
      userId: 'me',
      historyTypes: ['messageAdded'],
      startHistoryId: startHistoryId
    }

    const history = await gmail.users.history.list(historyRequest)

    const supabase = await createSupabaseServiceClient()

    if (history.data.historyId) {
      await supabase
        .from('webhook_configs')
        .update({
          config: {
            ...webhookConfigData,
            watch: {
              ...watchConfig,
              historyId: String(history.data.historyId)
            }
          }
        })
        .eq('id', webhookConfigId)
    }

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

function checkEmailMatchesFilters(email: any, filters: GmailTriggerFilters): boolean {
  console.log('🔍 Checking email against filters:', {
    email: { from: email.from, subject: email.subject, hasAttachments: email.hasAttachments },
    filters
  })

  if (filters.from && filters.from.length > 0) {
    const emailFromRaw = email.from || ''
    const emailLower = normalizeEmailString(emailFromRaw)
    const emailMatch = emailLower.match(/<(.+?)>/)
    const emailAddress = emailMatch ? emailMatch[1] : emailLower

    const normalizedFilters = filters.from.map(normalizeEmailString).filter(Boolean)

    if (normalizedFilters.length > 0) {
      const matches = normalizedFilters.some((filterToken) => {
        if (emailAddress === filterToken) return true
        if (emailLower.includes(filterToken)) return true
        return false
      })

      if (!matches) {
        console.log(`❌ Sender filter mismatch: "${emailFromRaw}" didn't match any of ${normalizedFilters.join(', ')}`)
        return false
      }

      console.log(`✅ Sender filter matched: "${emailFromRaw}" matched one of ${normalizedFilters.join(', ')}`)
    }
  }

  if (filters.subject && filters.subject.trim() !== '') {
    const subjectFilter = filters.subject.toLowerCase().trim()
    const emailSubject = (email.subject || '').toLowerCase()

    if (!emailSubject.includes(subjectFilter)) {
      console.log(`❌ Subject filter mismatch: "${emailSubject}" doesn't contain "${subjectFilter}"`)
      return false
    }
    console.log(`✅ Subject filter matched: "${emailSubject}" contains "${subjectFilter}"`)
  }

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

    // FIRST: Check for active test sessions waiting for Gmail triggers
    const { data: testSessions, error: sessionError } = await supabase
      .from('workflow_test_sessions')
      .select('*, workflows!inner(id, user_id, nodes, connections, name)')
      .eq('trigger_type', 'gmail_trigger_new_email')
      .in('status', ['listening'])

    if (!sessionError && testSessions && testSessions.length > 0) {
      console.log(`[Gmail] Found ${testSessions.length} active test session(s) waiting for Gmail trigger`)

      for (const session of testSessions) {
        try {
          const workflow = session.workflows
          if (!workflow) {
            console.error('[Gmail] No workflow found in test session', { sessionId: session.id })
            continue
          }

          console.log('[Gmail] Starting workflow execution for test session', {
            sessionId: session.id,
            workflowId: workflow.id,
            workflowName: workflow.name,
            userId: workflow.user_id,
            sessionUserId: session.user_id
          })

          // Use the user_id from the session (which is guaranteed to exist)
          const userId = session.user_id || workflow.user_id

          if (!userId) {
            console.error('[Gmail] No userId found - cannot execute workflow', {
              sessionId: session.id,
              workflowId: workflow.id
            })
            continue
          }

          // Create execution session using the advanced execution engine
          const executionEngine = new AdvancedExecutionEngine()
          const executionSession = await executionEngine.createExecutionSession(
            workflow.id,
            userId,  // Use the userId from session (more reliable)
            'webhook',
            {
              inputData: {
                provider: 'gmail',
                emailAddress: event.eventData.emailAddress,
                historyId: event.eventData.historyId,
                timestamp: new Date().toISOString()
              },
              webhookEvent: {
                provider: 'gmail',
                event: event.eventData
              }
            }
          )

          // Update test session to executing
          await supabase
            .from('workflow_test_sessions')
            .update({
              status: 'executing',
              execution_id: executionSession.id
            })
            .eq('id', session.id)

          // Start workflow execution
          await executionEngine.executeWorkflowAdvanced(executionSession.id, {
            provider: 'gmail',
            emailAddress: event.eventData.emailAddress,
            historyId: event.eventData.historyId,
            timestamp: new Date().toISOString()
          })

          console.log('[Gmail] Workflow execution started for test session', {
            sessionId: session.id,
            workflowId: workflow.id,
            executionId: executionSession.id
          })

        } catch (workflowError) {
          console.error(`[Gmail] Failed to execute workflow for test session ${session.id}:`, workflowError)
        }
      }

      // If test sessions were found, don't process regular workflows
      console.log('[Gmail] Test sessions processed, skipping regular workflow processing')
      return
    }

    // SECOND: Find all active workflows with Gmail webhook triggers (only if no test sessions)
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

      const { data: configRows, error: configError } = await supabase
        .from('webhook_configs')
        .select('id, config')
        .eq('workflow_id', workflow.id)
        .eq('trigger_type', 'gmail_trigger_new_email')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)

      if (configError) {
        console.error('Failed to fetch Gmail webhook config:', configError)
        continue
      }

      const webhookConfig = configRows?.[0]

      if (!webhookConfig) {
        console.log('⚠️ No Gmail webhook configuration found for workflow, skipping')
        continue
      }

      const watchConfig = webhookConfig.config?.watch || {}

      if (watchConfig.emailAddress && watchConfig.emailAddress !== event.eventData.emailAddress) {
        console.log('⚠️ Gmail notification email does not match workflow configuration, skipping')
        continue
      }

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

      const dedupeToken = emailDetails.id || event.eventData.messageId || `${event.eventData.emailAddress || 'unknown'}-${event.eventData.historyId}`

      // Check if email matches any trigger's filters
      let matchFound = false
      for (const triggerNode of gmailTriggerNodes) {
        const filters = resolveGmailTriggerFilters(triggerNode)

        console.log(`Checking trigger node ${triggerNode.id} filters:`, filters)

        if (checkEmailMatchesFilters(emailDetails, filters)) {
          matchFound = true
          break
        }
      }

      if (!matchFound) {
        console.log(`❌ Email doesn't match filters for workflow ${workflow.id}`)
        continue
      }

      if (dedupeToken && wasRecentlyProcessedGmail(workflow.id, dedupeToken)) {
        console.log(`⚠️ Duplicate Gmail event detected for workflow ${workflow.id} and token ${dedupeToken}, skipping execution`)
        continue
      }

      // Email matches filters - trigger the workflow
      try {
        console.log(`🎯 Triggering workflow: "${workflow.name}" (${workflow.id})`)

        if (dedupeToken) {
          markGmailEventProcessed(workflow.id, dedupeToken)
        }

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
        if (dedupeToken) {
          processedGmailEvents.delete(buildGmailDedupeKey(workflow.id, dedupeToken))
        }
      }
    }
  } catch (error) {
    console.error('Error triggering matching Gmail workflows:', error)
  }
} 
