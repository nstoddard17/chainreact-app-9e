import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { getMailchimpAuth } from './utils'

import { logger } from '@/lib/utils/logger'

/**
 * Schedule a campaign to be sent at a specific date and time
 */
export async function mailchimpScheduleCampaign(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get Mailchimp auth with proper data center
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const campaignId = context.dataFlowManager.resolveVariable(config.campaign_id)
    const scheduleType = context.dataFlowManager.resolveVariable(config.scheduleType) || 'absolute'
    const scheduleTime = context.dataFlowManager.resolveVariable(config.scheduleTime)
    const relativeAmount = parseInt(context.dataFlowManager.resolveVariable(config.relativeAmount) || '0')
    const relativeUnit = context.dataFlowManager.resolveVariable(config.relativeUnit) || 'hours'
    const timewarp = context.dataFlowManager.resolveVariable(config.timewarp) === true
    const batchDelivery = context.dataFlowManager.resolveVariable(config.batchDelivery) === true
    const batchCount = parseInt(context.dataFlowManager.resolveVariable(config.batchCount) || '1')

    if (!campaignId) {
      throw new Error("Campaign is required")
    }

    // Calculate the schedule time
    let scheduledDateTime: Date

    if (scheduleType === 'relative') {
      if (!relativeAmount || relativeAmount <= 0) {
        throw new Error("Please specify a valid amount for relative scheduling")
      }

      scheduledDateTime = new Date()
      if (relativeUnit === 'hours') {
        scheduledDateTime.setHours(scheduledDateTime.getHours() + relativeAmount)
      } else if (relativeUnit === 'days') {
        scheduledDateTime.setDate(scheduledDateTime.getDate() + relativeAmount)
      }
    } else {
      if (!scheduleTime) {
        throw new Error("Schedule date & time is required for absolute scheduling")
      }
      scheduledDateTime = new Date(scheduleTime)
    }

    // Ensure the schedule time is at least 15 minutes in the future
    const minScheduleTime = new Date()
    minScheduleTime.setMinutes(minScheduleTime.getMinutes() + 15)

    if (scheduledDateTime < minScheduleTime) {
      throw new Error("Schedule time must be at least 15 minutes in the future")
    }

    const url = `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}/actions/schedule`

    const requestBody: any = {
      schedule_time: scheduledDateTime.toISOString()
    }

    if (timewarp) {
      requestBody.timewarp = true
    }

    if (batchDelivery && batchCount > 1) {
      requestBody.batch_delivery = {
        batch_count: batchCount
      }
    }

    logger.info('Scheduling campaign in Mailchimp', {
      campaignId,
      scheduledFor: scheduledDateTime.toISOString(),
      timewarp,
      batchDelivery,
      batchCount
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

      if (response.status === 404) {
        return {
          success: false,
          output: {
            campaignId: campaignId
          },
          message: `Campaign ${campaignId} not found`
        }
      }

      logger.error('Mailchimp API error scheduling campaign', {
        status: response.status,
        error: errorMessage,
        errorData
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    // Get updated campaign info
    const campaignUrl = `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}`
    const campaignResponse = await fetch(campaignUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    let campaignData: any = {}
    if (campaignResponse.ok) {
      campaignData = await campaignResponse.json()
    }

    logger.info('Successfully scheduled campaign in Mailchimp', {
      campaignId,
      scheduledFor: scheduledDateTime.toISOString(),
      newStatus: campaignData.status
    })

    return {
      success: true,
      output: {
        scheduledTime: scheduledDateTime.toISOString(),
        campaignId: campaignId,
        status: campaignData.status || 'schedule'
      },
      message: `Successfully scheduled campaign for ${scheduledDateTime.toISOString()}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Schedule Campaign error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to schedule campaign'
    }
  }
}
