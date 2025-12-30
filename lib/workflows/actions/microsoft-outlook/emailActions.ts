import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { refreshMicrosoftToken } from '../core/refreshMicrosoftToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Reply to an existing Outlook email
 */
export async function replyToOutlookEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { emailId, replyAll, body, attachments } = resolvedConfig

    if (!emailId) {
      throw new Error('Email ID is required to reply to an email')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Determine reply endpoint based on replyAll setting
    const endpoint = replyAll === true || replyAll === 'true'
      ? `https://graph.microsoft.com/v1.0/me/messages/${emailId}/replyAll`
      : `https://graph.microsoft.com/v1.0/me/messages/${emailId}/reply`

    const replyData: any = {
      comment: body || ''
    }

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(replyData)
      })
    }

    let response = await makeRequest(accessToken)

    // Handle token refresh on 401
    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to reply to email: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to reply to email: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    return {
      success: true,
      output: {
        sent: true,
        replyAll: replyAll === true || replyAll === 'true',
        originalEmailId: emailId,
        sentAt: new Date().toISOString()
      }
    }
  } catch (error: any) {
    logger.error('[Outlook] Error replying to email:', error)
    throw error
  }
}

/**
 * Forward an existing Outlook email
 */
export async function forwardOutlookEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { emailId, to, cc, comment } = resolvedConfig

    if (!emailId) {
      throw new Error('Email ID is required to forward an email')
    }
    if (!to) {
      throw new Error('At least one recipient is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Process recipients
    const processRecipients = (recipients: string | string[] | undefined) => {
      if (!recipients) return []
      const recipientList = Array.isArray(recipients) ? recipients : [recipients]
      return recipientList.filter(Boolean).map(email => ({
        emailAddress: { address: email.trim() }
      }))
    }

    const forwardData: any = {
      toRecipients: processRecipients(to),
      comment: comment || ''
    }

    if (cc) {
      forwardData.ccRecipients = processRecipients(cc)
    }

    const endpoint = `https://graph.microsoft.com/v1.0/me/messages/${emailId}/forward`

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(forwardData)
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to forward email: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to forward email: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    return {
      success: true,
      output: {
        sent: true,
        forwardedTo: forwardData.toRecipients.map((r: any) => r.emailAddress.address),
        originalEmailId: emailId,
        sentAt: new Date().toISOString()
      }
    }
  } catch (error: any) {
    logger.error('[Outlook] Error forwarding email:', error)
    throw error
  }
}

/**
 * Create a draft email in Outlook
 */
export async function createOutlookDraftEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { to, cc, bcc, subject, body, importance = 'normal' } = resolvedConfig

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    const processRecipients = (recipients: string | string[] | undefined) => {
      if (!recipients) return []
      const recipientList = Array.isArray(recipients) ? recipients : [recipients]
      return recipientList.filter(Boolean).map(email => ({
        emailAddress: { address: email.trim() }
      }))
    }

    const draftData: any = {
      subject: subject || '',
      body: {
        contentType: 'HTML',
        content: body || ''
      },
      toRecipients: processRecipients(to),
      ccRecipients: processRecipients(cc),
      bccRecipients: processRecipients(bcc),
      importance: importance.toLowerCase()
    }

    const makeRequest = async (token: string) => {
      return fetch('https://graph.microsoft.com/v1.0/me/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(draftData)
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to create draft: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to create draft: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const draft = await response.json()

    return {
      success: true,
      output: {
        id: draft.id,
        subject: draft.subject,
        webLink: draft.webLink,
        createdAt: draft.createdDateTime
      }
    }
  } catch (error: any) {
    logger.error('[Outlook] Error creating draft email:', error)
    throw error
  }
}

/**
 * Move an email to a different folder
 */
export async function moveOutlookEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { emailId, destinationFolderId } = resolvedConfig

    if (!emailId) {
      throw new Error('Email ID is required')
    }
    if (!destinationFolderId) {
      throw new Error('Destination folder ID is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    const moveData = {
      destinationId: destinationFolderId
    }

    const endpoint = `https://graph.microsoft.com/v1.0/me/messages/${emailId}/move`

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(moveData)
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to move email: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to move email: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const movedEmail = await response.json()

    return {
      success: true,
      output: {
        id: movedEmail.id,
        moved: true,
        newFolderId: destinationFolderId
      }
    }
  } catch (error: any) {
    logger.error('[Outlook] Error moving email:', error)
    throw error
  }
}

/**
 * Delete an email
 */
export async function deleteOutlookEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { emailId, permanentDelete } = resolvedConfig

    if (!emailId) {
      throw new Error('Email ID is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    let endpoint: string
    let method: string

    if (permanentDelete === true || permanentDelete === 'true') {
      // Permanently delete
      endpoint = `https://graph.microsoft.com/v1.0/me/messages/${emailId}`
      method = 'DELETE'
    } else {
      // Move to Deleted Items folder
      endpoint = `https://graph.microsoft.com/v1.0/me/messages/${emailId}/move`
      method = 'POST'
    }

    const makeRequest = async (token: string) => {
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }

      if (method === 'POST') {
        options.body = JSON.stringify({ destinationId: 'deleteditems' })
      }

      return fetch(endpoint, options)
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text()
      let errorMessage = `Failed to delete email: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to delete email: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    return {
      success: true,
      output: {
        deleted: true,
        emailId,
        permanent: permanentDelete === true || permanentDelete === 'true'
      }
    }
  } catch (error: any) {
    logger.error('[Outlook] Error deleting email:', error)
    throw error
  }
}

/**
 * Add categories to an email
 */
export async function addOutlookCategories(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { emailId, categories } = resolvedConfig

    if (!emailId) {
      throw new Error('Email ID is required')
    }
    if (!categories) {
      throw new Error('Categories are required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Parse categories - support comma-separated string or array
    let categoryList: string[]
    if (Array.isArray(categories)) {
      categoryList = categories
    } else if (typeof categories === 'string') {
      categoryList = categories.split(',').map(c => c.trim()).filter(Boolean)
    } else {
      throw new Error('Categories must be a string or array')
    }

    const endpoint = `https://graph.microsoft.com/v1.0/me/messages/${emailId}`

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ categories: categoryList })
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to add categories: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to add categories: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const updatedEmail = await response.json()

    return {
      success: true,
      output: {
        id: updatedEmail.id,
        categories: updatedEmail.categories
      }
    }
  } catch (error: any) {
    logger.error('[Outlook] Error adding categories:', error)
    throw error
  }
}

/**
 * Get/fetch emails from Outlook
 * Note: Microsoft Graph API doesn't support $filter and $search together.
 * When search is used, we fetch more results and filter by date client-side.
 */
export async function getOutlookEmails(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { folderId, query, maxResults = 10, startDate, endDate, includeDeleted } = resolvedConfig

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Build the query URL
    let endpoint = 'https://graph.microsoft.com/v1.0/me/messages'

    if (folderId && folderId !== 'inbox') {
      endpoint = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`
    }

    const params = new URLSearchParams()
    params.append('$select', 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,hasAttachments,importance,isRead')

    // Microsoft Graph API limitation: $filter and $search cannot be used together
    // If search query is provided, we skip $filter and do client-side date filtering
    const hasSearch = query && query.trim()
    const hasDateFilter = startDate || endDate

    if (hasSearch) {
      // When searching, fetch more results to allow for client-side date filtering
      params.append('$top', Math.min(Math.max(1, maxResults) * 3, 100).toString())
      params.append('$search', `"${query}"`)
      // Note: $orderby is not supported with $search in Microsoft Graph
    } else {
      params.append('$top', Math.min(Math.max(1, maxResults), 50).toString())
      params.append('$orderby', 'receivedDateTime desc')

      // Build filter conditions (only when not searching)
      const filters: string[] = []

      if (startDate) {
        filters.push(`receivedDateTime ge ${new Date(startDate).toISOString()}`)
      }
      if (endDate) {
        filters.push(`receivedDateTime le ${new Date(endDate).toISOString()}`)
      }

      if (filters.length > 0) {
        params.append('$filter', filters.join(' and '))
      }
    }

    const fullEndpoint = `${endpoint}?${params.toString()}`

    const makeRequest = async (token: string) => {
      return fetch(fullEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'ConsistencyLevel': 'eventual'
        }
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to fetch emails: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to fetch emails: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const data = await response.json()
    let messages = data.value || []

    // Client-side date filtering when search was used
    if (hasSearch && hasDateFilter) {
      const startDateObj = startDate ? new Date(startDate) : null
      const endDateObj = endDate ? new Date(endDate) : null

      messages = messages.filter((msg: any) => {
        const msgDate = new Date(msg.receivedDateTime)
        if (startDateObj && msgDate < startDateObj) return false
        if (endDateObj && msgDate > endDateObj) return false
        return true
      })
    }

    // Limit results to maxResults after filtering
    messages = messages.slice(0, Math.min(Math.max(1, maxResults), 50))

    return {
      success: true,
      output: {
        messages: messages.map((msg: any) => ({
          id: msg.id,
          subject: msg.subject,
          from: msg.from?.emailAddress,
          to: msg.toRecipients?.map((r: any) => r.emailAddress),
          cc: msg.ccRecipients?.map((r: any) => r.emailAddress),
          receivedDateTime: msg.receivedDateTime,
          bodyPreview: msg.bodyPreview,
          hasAttachments: msg.hasAttachments,
          importance: msg.importance,
          isRead: msg.isRead
        })),
        count: messages.length
      }
    }
  } catch (error: any) {
    logger.error('[Outlook] Error fetching emails:', error)
    throw error
  }
}

/**
 * Search for emails in Outlook
 */
export async function searchOutlookEmail(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { query, folderId, maxResults = 25 } = resolvedConfig

    if (!query) {
      throw new Error('Search query is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Build the search URL
    let endpoint = 'https://graph.microsoft.com/v1.0/me/messages'

    if (folderId && folderId !== 'all') {
      endpoint = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`
    }

    const params = new URLSearchParams()
    params.append('$search', `"${query}"`)
    params.append('$top', Math.min(Math.max(1, maxResults), 50).toString())
    params.append('$select', 'id,subject,from,toRecipients,receivedDateTime,bodyPreview,hasAttachments')

    const fullEndpoint = `${endpoint}?${params.toString()}`

    const makeRequest = async (token: string) => {
      return fetch(fullEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'ConsistencyLevel': 'eventual'
        }
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to search emails: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to search emails: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const data = await response.json()
    const messages = data.value || []

    return {
      success: true,
      output: {
        messages: messages.map((msg: any) => ({
          id: msg.id,
          subject: msg.subject,
          from: msg.from?.emailAddress,
          to: msg.toRecipients?.map((r: any) => r.emailAddress),
          receivedDateTime: msg.receivedDateTime,
          bodyPreview: msg.bodyPreview,
          hasAttachments: msg.hasAttachments
        })),
        count: messages.length
      }
    }
  } catch (error: any) {
    logger.error('[Outlook] Error searching emails:', error)
    throw error
  }
}
