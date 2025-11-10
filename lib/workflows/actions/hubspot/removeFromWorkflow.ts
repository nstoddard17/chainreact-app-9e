import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Remove Contact from HubSpot Workflow
 *
 * API: DELETE /automation/v2/workflows/{workflowId}/enrollments/contacts/{email}
 */
export async function hubspotRemoveFromWorkflow(
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

    logger.debug('Unenrolling contact from workflow:', { workflowId, contactEmail })

    const response = await fetch(
      `https://api.hubapi.com/automation/v2/workflows/${workflowId}/enrollments/contacts/${contactEmail}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
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
          unenrolledAt: new Date().toISOString()
        },
        message: `Successfully unenrolled ${contactEmail} from workflow`
      }
    }

    const errorText = await response.text()
    throw new Error(`HubSpot API error: ${response.status} - ${errorText}`)

  } catch (error: any) {
    logger.error('HubSpot Remove from Workflow error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to unenroll contact from workflow'
    }
  }
}
