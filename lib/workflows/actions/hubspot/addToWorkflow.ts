import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Add Contact to HubSpot Workflow
 *
 * API: POST /automation/v2/workflows/{workflowId}/enrollments/contacts/{email}
 */
export async function hubspotAddToWorkflow(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "hubspot")

    // Resolve dynamic values
    const workflowId = context.dataFlowManager.resolveVariable(config.workflowId)
    const contactEmail = context.dataFlowManager.resolveVariable(config.contactEmail)

    if (!workflowId || !contactEmail) {
      throw new Error('Workflow ID and contact email are required')
    }

    logger.debug('Enrolling contact in workflow:', { workflowId, contactEmail })

    const response = await fetch(
      `https://api.hubapi.com/automation/v2/workflows/${workflowId}/enrollments/contacts/${contactEmail}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    // HubSpot returns 204 No Content on success
    if (response.status === 204 || response.ok) {
      return {
        success: true,
        output: {
          success: true,
          workflowId,
          contactEmail,
          enrolledAt: new Date().toISOString()
        },
        message: `Successfully enrolled ${contactEmail} in workflow`
      }
    }

    const errorText = await response.text()
    throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)

  } catch (error: any) {
    logger.error('HubSpot Add to Workflow error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to enroll contact in workflow'
    }
  }
}
