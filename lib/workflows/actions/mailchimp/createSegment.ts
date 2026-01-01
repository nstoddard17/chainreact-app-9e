import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { getMailchimpAuth } from './utils'

import { logger } from '@/lib/utils/logger'

/**
 * Create a segment in a Mailchimp audience
 */
export async function mailchimpCreateSegment(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get Mailchimp auth with proper data center
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const name = context.dataFlowManager.resolveVariable(config.name)
    const segmentType = context.dataFlowManager.resolveVariable(config.segmentType) || 'static'
    const membersInput = context.dataFlowManager.resolveVariable(config.members)
    const conditionType = context.dataFlowManager.resolveVariable(config.conditionType)
    const conditionOperator = context.dataFlowManager.resolveVariable(config.conditionOperator)
    const conditionValue = context.dataFlowManager.resolveVariable(config.conditionValue)

    if (!audienceId) {
      throw new Error("Audience is required")
    }

    if (!name) {
      throw new Error("Segment name is required")
    }

    const url = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/segments`

    const requestBody: any = {
      name: name
    }

    if (segmentType === 'static') {
      // Static segment with specific member emails
      requestBody.static_segment = []

      if (membersInput) {
        // Parse members from newline-separated email list
        const members = membersInput
          .split('\n')
          .map((email: string) => email.trim())
          .filter((email: string) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            return emailRegex.test(email)
          })

        requestBody.static_segment = members
      }
    } else if (segmentType === 'saved') {
      // Saved segment with conditions
      if (!conditionType || !conditionOperator) {
        throw new Error("Condition type and operator are required for saved segments")
      }

      requestBody.options = {
        match: 'all',
        conditions: [
          {
            condition_type: conditionType,
            op: conditionOperator,
            field: getFieldForConditionType(conditionType),
            value: conditionValue || ''
          }
        ]
      }
    }

    logger.info('Creating segment in Mailchimp', {
      audienceId,
      name,
      segmentType,
      memberCount: requestBody.static_segment?.length || 0
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`

      logger.error('Mailchimp API error creating segment', {
        status: response.status,
        error: errorMessage,
        errorData
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    const data = await response.json()

    logger.info('Successfully created segment in Mailchimp', {
      segmentId: data.id,
      name: data.name,
      memberCount: data.member_count
    })

    return {
      success: true,
      output: {
        segmentId: data.id,
        name: data.name,
        memberCount: data.member_count,
        type: data.type,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      },
      message: `Successfully created segment "${name}" with ${data.member_count} members`
    }
  } catch (error: any) {
    logger.error('Mailchimp Create Segment error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create segment'
    }
  }
}

/**
 * Get the field name for a given condition type
 */
function getFieldForConditionType(conditionType: string): string {
  const fieldMap: Record<string, string> = {
    'EmailAddress': 'EMAIL',
    'Date': 'timestamp_opt',
    'Campaign': 'campaign_id',
    'Automation': 'automation_id',
    'StaticSegment': 'static_segment',
    'Language': 'language',
    'Tags': 'tags'
  }

  return fieldMap[conditionType] || conditionType.toLowerCase()
}
