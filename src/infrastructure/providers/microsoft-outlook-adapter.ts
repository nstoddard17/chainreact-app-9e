import { 
  EmailProvider, 
  EmailMessage, 
  EmailResult, 
  EmailFilters, 
  GetMessagesParams, 
  LabelOperation, 
  LabelResult, 
  Contact, 
  ContactFilters 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class MicrosoftOutlookAdapter implements EmailProvider {
  readonly providerId = 'microsoft-outlook'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 10000, window: 600000 }, // 10,000 requests per 10 minutes
      { type: 'messages', limit: 2000, window: 3600000 }  // 2,000 messages per hour
    ],
    supportedFeatures: [
      'send_message',
      'search_messages',
      'get_messages',
      'manage_labels',
      'get_contacts',
      'attachments',
      'threading',
      'folders',
      'rules',
      'calendar_integration'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-outlook')
      
      // Test Microsoft Graph API access with a simple user info call
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  async sendMessage(params: EmailMessage, userId: string): Promise<EmailResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-outlook')
      
      const messagePayload: any = {
        subject: params.subject,
        body: {
          contentType: 'HTML',
          content: params.body
        },
        toRecipients: params.to.map(email => ({ emailAddress: { address: email } }))
      }
      
      // Add CC recipients
      if (params.cc && params.cc.length > 0) {
        messagePayload.ccRecipients = params.cc.map(email => ({ emailAddress: { address: email } }))
      }
      
      // Add BCC recipients
      if (params.bcc && params.bcc.length > 0) {
        messagePayload.bccRecipients = params.bcc.map(email => ({ emailAddress: { address: email } }))
      }
      
      // Add attachments
      if (params.attachments && params.attachments.length > 0) {
        messagePayload.attachments = params.attachments.map(attachment => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.filename,
          contentType: attachment.contentType,
          contentBytes: Buffer.isBuffer(attachment.content) 
            ? attachment.content.toString('base64')
            : Buffer.from(attachment.content as string).toString('base64')
        }))
      }
      
      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: messagePayload,
          saveToSentItems: true
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      // Get sent message info (Graph doesn't return message ID from sendMail)
      return {
        success: true,
        output: {
          subject: params.subject,
          recipients: params.to,
          timestamp: new Date().toISOString()
        },
        message: 'Email sent successfully via Microsoft Outlook'
      }
    } catch (error: any) {
      console.error('Microsoft Outlook send message error:', error)
      return {
        success: false,
        error: error.message || 'Failed to send email via Microsoft Outlook',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async searchMessages(filters: EmailFilters, userId: string): Promise<EmailMessage[]> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-outlook')
      
      // Build search query
      let searchQuery = ''
      const filterParts: string[] = []
      
      if (filters.from) {
        filterParts.push(`from:'${filters.from}'`)
      }
      if (filters.to) {
        filterParts.push(`to:'${filters.to}'`)
      }
      if (filters.subject) {
        filterParts.push(`subject:'${filters.subject}'`)
      }
      if (filters.hasAttachment) {
        filterParts.push('hasAttachments:true')
      }
      
      if (filterParts.length > 0) {
        searchQuery = filterParts.join(' AND ')
      }
      
      let url = 'https://graph.microsoft.com/v1.0/me/messages'
      const params = new URLSearchParams()
      
      if (searchQuery) {
        params.append('$search', `"${searchQuery}"`)
      }
      
      if (filters.limit) {
        params.append('$top', filters.limit.toString())
      }
      
      // Add date filter if provided
      if (filters.dateRange) {
        const dateFilter = `receivedDateTime ge ${filters.dateRange.start.toISOString()} and receivedDateTime le ${filters.dateRange.end.toISOString()}`
        params.append('$filter', dateFilter)
      }
      
      params.append('$orderby', 'receivedDateTime desc')
      params.append('$select', 'id,subject,from,toRecipients,ccRecipients,bccRecipients,body,receivedDateTime,hasAttachments,attachments')
      
      if (params.toString()) {
        url += `?${params.toString()}`
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to search messages in Microsoft Outlook')
      }
      
      const data = await response.json()
      
      return (data.value || []).map((message: any) => ({
        to: message.toRecipients?.map((r: any) => r.emailAddress.address) || [],
        cc: message.ccRecipients?.map((r: any) => r.emailAddress.address) || [],
        bcc: message.bccRecipients?.map((r: any) => r.emailAddress.address) || [],
        subject: message.subject || '',
        body: message.body?.content || '',
        attachments: message.attachments?.map((att: any) => ({
          filename: att.name,
          contentType: att.contentType,
          size: att.size,
          content: '' // Content not included in list operations
        })) || [],
        metadata: {
          messageId: message.id,
          from: message.from?.emailAddress?.address,
          receivedDateTime: message.receivedDateTime,
          hasAttachments: message.hasAttachments,
          microsoftResponse: message
        }
      }))
    } catch (error: any) {
      console.error('Microsoft Outlook search messages error:', error)
      return []
    }
  }

  async getMessages(params: GetMessagesParams, userId: string): Promise<EmailMessage[]> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-outlook')
      
      let url = 'https://graph.microsoft.com/v1.0/me/messages'
      const urlParams = new URLSearchParams()
      
      if (params.limit) {
        urlParams.append('$top', params.limit.toString())
      }
      
      // Handle folder filtering (Outlook uses folders instead of labels)
      if (params.labelIds && params.labelIds.length > 0) {
        // Use first labelId as folder filter
        const folderId = params.labelIds[0]
        if (folderId !== 'inbox') {
          url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`
        }
      }
      
      urlParams.append('$orderby', 'receivedDateTime desc')
      urlParams.append('$select', 'id,subject,from,toRecipients,ccRecipients,bccRecipients,body,receivedDateTime,hasAttachments,attachments')
      
      if (urlParams.toString()) {
        url += `?${urlParams.toString()}`
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get messages from Microsoft Outlook')
      }
      
      const data = await response.json()
      
      return (data.value || []).map((message: any) => ({
        to: message.toRecipients?.map((r: any) => r.emailAddress.address) || [],
        cc: message.ccRecipients?.map((r: any) => r.emailAddress.address) || [],
        bcc: message.bccRecipients?.map((r: any) => r.emailAddress.address) || [],
        subject: message.subject || '',
        body: message.body?.content || '',
        attachments: message.attachments?.map((att: any) => ({
          filename: att.name,
          contentType: att.contentType,
          size: att.size,
          content: '' // Content not included in list operations
        })) || [],
        metadata: {
          messageId: message.id,
          from: message.from?.emailAddress?.address,
          receivedDateTime: message.receivedDateTime,
          hasAttachments: message.hasAttachments,
          microsoftResponse: message
        }
      }))
    } catch (error: any) {
      console.error('Microsoft Outlook get messages error:', error)
      return []
    }
  }

  async manageLabels(operation: LabelOperation, userId: string): Promise<LabelResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-outlook')
      
      const results: any[] = []
      
      switch (operation.type) {
        case 'create':
          if (!operation.labelName) {
            throw new Error('Label name is required for create operation')
          }
          
          const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              displayName: operation.labelName
            })
          })
          
          if (createResponse.ok) {
            const folder = await createResponse.json()
            results.push({
              id: folder.id,
              name: folder.displayName,
              type: 'user'
            })
          }
          break
          
        case 'add':
          if (!operation.messageIds || !operation.labelIds) {
            throw new Error('Message IDs and label IDs are required for add operation')
          }
          
          // Move messages to folder (Outlook folders vs Gmail labels)
          for (const messageId of operation.messageIds) {
            for (const folderId of operation.labelIds) {
              const moveResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/move`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  destinationId: folderId
                })
              })
              
              if (moveResponse.ok) {
                const result = await moveResponse.json()
                results.push(result)
              }
            }
          }
          break
          
        case 'delete':
          if (!operation.labelIds) {
            throw new Error('Label IDs are required for delete operation')
          }
          
          for (const folderId of operation.labelIds) {
            const deleteResponse = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            })
            
            if (deleteResponse.ok) {
              results.push({ id: folderId, deleted: true })
            }
          }
          break
          
        default:
          throw new Error(`Unsupported label operation: ${operation.type}`)
      }
      
      return {
        success: true,
        output: {
          operation: operation.type,
          results: results,
          labels: results.map(r => ({
            id: r.id,
            name: r.name || r.displayName,
            type: r.type || 'user'
          }))
        },
        message: `Label operation ${operation.type} completed successfully`
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to manage labels in Microsoft Outlook',
        output: { error: error.message }
      }
    }
  }

  async getContacts(filters?: ContactFilters, userId?: string): Promise<Contact[]> {
    if (!userId) {
      throw new Error('User ID is required for getContacts')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-outlook')
      
      let url = 'https://graph.microsoft.com/v1.0/me/contacts'
      const params = new URLSearchParams()
      
      if (filters?.limit) {
        params.append('$top', filters.limit.toString())
      }
      
      if (filters?.name) {
        params.append('$filter', `startswith(displayName,'${filters.name}')`)
      }
      
      if (filters?.email) {
        params.append('$filter', `emailAddresses/any(e:e/address eq '${filters.email}')`)
      }
      
      params.append('$select', 'id,displayName,emailAddresses,mobilePhone,businessPhones')
      params.append('$orderby', 'displayName')
      
      if (params.toString()) {
        url += `?${params.toString()}`
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get contacts from Microsoft Outlook')
      }
      
      const data = await response.json()
      
      return (data.value || []).map((contact: any) => ({
        id: contact.id,
        name: contact.displayName || 'Unknown Contact',
        email: contact.emailAddresses?.[0]?.address || '',
        phone: contact.mobilePhone || contact.businessPhones?.[0] || '',
        metadata: {
          emailAddresses: contact.emailAddresses,
          mobilePhone: contact.mobilePhone,
          businessPhones: contact.businessPhones,
          microsoftResponse: contact
        }
      }))
    } catch (error: any) {
      console.error('Microsoft Outlook get contacts error:', error)
      return []
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid_grant')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient privileges')) {
      return 'authorization'
    }
    if (message.includes('throttled') || message.includes('rate limit')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'notFound'
    }
    if (message.includes('bad request') || message.includes('invalid')) {
      return 'validation'
    }
    if (message.includes('quota') || message.includes('mailbox')) {
      return 'quota'
    }
    
    return 'unknown'
  }
}