/**
 * Discord Trigger Lifecycle
 *
 * Manages Discord slash commands and other triggers
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 */

import { createClient } from '@supabase/supabase-js'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class DiscordTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Discord trigger
   * Registers slash commands in Discord guilds
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    console.log(`🔔 Activating Discord trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Only slash commands need external registration
    if (triggerType === 'discord_trigger_slash_command') {
      await this.registerSlashCommand(workflowId, userId, nodeId, config)
    } else {
      // Other Discord triggers (message_sent, member_join) just listen to events
      // Store metadata but no external registration needed
      await supabase.from('trigger_resources').insert({
        workflow_id: workflowId,
        user_id: userId,
        provider_id: 'discord',
        trigger_type: triggerType,
        node_id: nodeId,
        resource_type: 'other',
        config,
        status: 'active'
      })
      console.log(`✅ Discord ${triggerType} trigger activated (passive listener)`)
    }
  }

  /**
   * Register a Discord slash command
   */
  private async registerSlashCommand(
    workflowId: string,
    userId: string,
    nodeId: string,
    config: any
  ): Promise<void> {
    const botToken = process.env.DISCORD_BOT_TOKEN
    const appId = process.env.DISCORD_CLIENT_ID
    const { guildId, command, commandDescription, commandOptions } = config

    if (!botToken || !appId) {
      throw new Error('Discord bot token or app ID not configured')
    }

    if (!guildId || !command) {
      throw new Error('Guild ID and command name are required for Discord slash commands')
    }

    console.log(`📤 Registering Discord slash command: /${command} in guild ${guildId}`)

    // Check if command already exists
    const listUrl = `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    const existingResponse = await fetch(listUrl, {
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!existingResponse.ok) {
      throw new Error(`Failed to list Discord commands: ${existingResponse.status}`)
    }

    const existingCommands = await existingResponse.json()
    const existing = existingCommands.find((c: any) => c.name === command)

    let commandId: string

    if (existing) {
      // Update existing command
      commandId = existing.id
      const updateResponse = await fetch(`${listUrl}/${commandId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: command,
          description: commandDescription || 'Custom command created by ChainReact workflow',
          type: 1,
          options: Array.isArray(commandOptions) ? commandOptions : []
        })
      })

      if (!updateResponse.ok) {
        throw new Error(`Failed to update Discord command: ${updateResponse.status}`)
      }

      console.log(`✅ Updated existing Discord slash command: ${commandId}`)
    } else {
      // Create new command
      const createResponse = await fetch(listUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: command,
          description: commandDescription || 'Custom command created by ChainReact workflow',
          type: 1,
          options: Array.isArray(commandOptions) ? commandOptions : []
        })
      })

      if (!createResponse.ok) {
        const errorText = await createResponse.text()
        throw new Error(`Failed to create Discord command: ${createResponse.status} ${errorText}`)
      }

      const created = await createResponse.json()
      commandId = created.id
      console.log(`✅ Created new Discord slash command: ${commandId}`)
    }

    // Store in trigger_resources table
    await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider_id: 'discord',
      trigger_type: 'discord_trigger_slash_command',
      node_id: nodeId,
      resource_type: 'other',
      external_id: commandId,
      config: {
        guildId,
        command,
        commandDescription,
        commandOptions
      },
      status: 'active'
    })
  }

  /**
   * Deactivate Discord trigger
   * Deletes slash commands
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId } = context

    console.log(`🛑 Deactivating Discord triggers for workflow ${workflowId}`)

    // Get all Discord triggers for this workflow
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'discord')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      console.log(`ℹ️ No active Discord triggers for workflow ${workflowId}`)
      return
    }

    const botToken = process.env.DISCORD_BOT_TOKEN
    const appId = process.env.DISCORD_CLIENT_ID

    for (const resource of resources) {
      try {
        // Only delete slash commands (other triggers are passive)
        if (resource.trigger_type === 'discord_trigger_slash_command' && resource.external_id) {
          if (!botToken || !appId || !resource.config?.guildId) {
            console.warn('Missing Discord credentials, skipping command deletion')
            continue
          }

          const deleteUrl = `https://discord.com/api/v10/applications/${appId}/guilds/${resource.config.guildId}/commands/${resource.external_id}`
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bot ${botToken}`
            }
          })

          if (!response.ok && response.status !== 404) {
            throw new Error(`Failed to delete command: ${response.status}`)
          }

          console.log(`✅ Deleted Discord slash command: ${resource.external_id}`)
        }

        // Mark as deleted in trigger_resources
        await supabase
          .from('trigger_resources')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', resource.id)

      } catch (error) {
        console.error(`❌ Failed to deactivate Discord trigger ${resource.id}:`, error)
        await supabase
          .from('trigger_resources')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', resource.id)
      }
    }
  }

  /**
   * Delete Discord trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Discord triggers
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'discord')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active triggers found',
        lastChecked: new Date().toISOString()
      }
    }

    // Discord commands don't expire, so always healthy if they exist
    return {
      healthy: true,
      details: `All Discord triggers healthy (${resources.length} active)`,
      lastChecked: new Date().toISOString()
    }
  }
}
