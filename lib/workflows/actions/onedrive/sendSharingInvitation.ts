import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Send sharing invitation for a file or folder in OneDrive
 */
export async function sendOnedriveSharingInvitation(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "onedrive")

    // Resolve dynamic values
    const itemType = context.dataFlowManager.resolveVariable(config.itemType) || 'file'
    const fileId = context.dataFlowManager.resolveVariable(config.fileId)
    const folderIdToShare = context.dataFlowManager.resolveVariable(config.folderIdToShare)
    const recipientsText = context.dataFlowManager.resolveVariable(config.recipients)
    const role = context.dataFlowManager.resolveVariable(config.role) || 'read'
    const requireSignIn = context.dataFlowManager.resolveVariable(config.requireSignIn) !== false
    const sendInvitation = context.dataFlowManager.resolveVariable(config.sendInvitation) !== false
    const message = context.dataFlowManager.resolveVariable(config.message)

    if (!recipientsText) {
      throw new Error("Recipients are required")
    }

    // Determine which item to share
    let targetItemId: string | null = null
    if (itemType === 'file' && fileId) {
      targetItemId = fileId
    } else if (itemType === 'folder' && folderIdToShare) {
      targetItemId = folderIdToShare
    }

    if (!targetItemId) {
      throw new Error("Please select an item to share")
    }

    // Parse recipients (comma-separated or newline-separated emails)
    const recipientEmails = recipientsText
      .split(/[,\n]/)
      .map((email: string) => email.trim())
      .filter((email: string) => email.length > 0)

    if (recipientEmails.length === 0) {
      throw new Error("Please provide at least one valid email address")
    }

    // Build invitation request payload
    const payload: any = {
      requireSignIn,
      sendInvitation,
      roles: [role], // 'read' or 'write'
      recipients: recipientEmails.map((email: string) => ({
        email
      }))
    }

    if (message) {
      payload.message = message
    }

    logger.debug('[OneDrive] Sending sharing invitation:', {
      itemId: targetItemId,
      recipients: recipientEmails,
      role,
      requireSignIn,
      sendInvitation
    })

    const inviteUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${targetItemId}/invite`

    const response = await fetch(inviteUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OneDrive API error: ${response.status} - ${errorText}`)
    }

    const invitationResult = await response.json()

    // Get item details for the response
    const itemResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${targetItemId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    let itemName = 'Unknown'
    if (itemResponse.ok) {
      const itemDetails = await itemResponse.json()
      itemName = itemDetails.name
    }

    return {
      success: true,
      output: {
        success: true,
        invitationIds: invitationResult.value?.map((inv: any) => inv.id) || [],
        recipients: recipientEmails,
        role,
        itemName,
        sentTime: new Date().toISOString()
      },
      message: `Successfully sent sharing invitation to ${recipientEmails.length} recipient(s) for: ${itemName}`
    }
  } catch (error: any) {
    logger.error('OneDrive Send Sharing Invitation error:', error)
    return {
      success: false,
      output: {
        success: false
      },
      message: error.message || 'Failed to send sharing invitation in OneDrive'
    }
  }
}
