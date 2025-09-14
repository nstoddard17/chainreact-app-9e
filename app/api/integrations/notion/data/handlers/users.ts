/**
 * Notion Users Handler
 */

import { NotionIntegration, NotionUser, NotionDataHandler } from '../types'
import { validateNotionIntegration } from '../utils'
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Fetch all users in the Notion workspace
 * Uses the Notion API to get actual workspace users
 */
export const getNotionUsers: NotionDataHandler<NotionUser> = async (integration: any, context?: any) => {
  try {
    console.log("👥 [Notion Users] Fetching workspace users")
    console.log("🔍 Integration data:", integration)
    console.log("🔍 Context:", context)

    // Import decrypt function
    const { decrypt } = await import("@/lib/security/encryption")
    const encryptionKey = process.env.ENCRYPTION_KEY!

    // Get the Notion integration - handle both integrationId and userId cases
    const supabase = createAdminClient()
    let notionIntegration
    let integrationError

    if (integration.id) {
      // If we have a specific integration ID, use that
      console.log(`🔍 Looking up integration by ID: ${integration.id}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integration.id)
        .single()
      notionIntegration = result.data
      integrationError = result.error
    } else if (integration.userId) {
      // If we have a user ID, find the Notion integration for that user
      console.log(`🔍 Looking up Notion integration for user: ${integration.userId}`)
      const result = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', integration.userId)
        .eq('provider', 'notion')
        .eq('status', 'connected')
        .single()
      notionIntegration = result.data
      integrationError = result.error
    }

    if (integrationError || !notionIntegration) {
      console.error("❌ [Notion Users] Integration not found:", integrationError)
      throw new Error('Notion integration not found or not connected')
    }

    // Decrypt the access token
    const decryptedToken = await decrypt(notionIntegration.access_token, encryptionKey)

    // Fetch all users from Notion API
    const response = await fetch('https://api.notion.com/v1/users', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${decryptedToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json()
      console.error("❌ [Notion Users] API error:", error)
      throw new Error(error.message || 'Failed to fetch users')
    }

    const data = await response.json()
    console.log("📥 [Notion Users] Raw API response:", {
      totalUsers: data.results?.length || 0,
      hasMore: data.has_more,
      nextCursor: data.next_cursor
    })

    // Log each user for debugging
    data.results?.forEach((user: any, index: number) => {
      console.log(`👤 [User ${index + 1}]:`, {
        id: user.id,
        type: user.type,
        name: user.name,
        person: user.person,
        bot: user.bot,
        avatar_url: user.avatar_url
      })
    })

    // Map Notion users to our format
    const users: NotionUser[] = data.results.map((user: any) => {
      // Get user name - handle different user types
      let name = 'Unknown User'
      let displayName = ''

      if (user.type === 'person') {
        // For person type, use their name or email
        name = user.name || user.person?.email || 'Unknown User'
        displayName = name
      } else if (user.type === 'bot') {
        // For bots, check various name sources
        // Bots often have the workspace name, not their actual name
        if (user.bot?.owner?.type === 'workspace') {
          // This is likely a workspace bot (like the default integration bot)
          name = user.name || 'Workspace Bot'
          // If the bot name is the same as workspace name, clarify it's a bot
          displayName = name.includes('Bot') ? name : `${name} (Bot)`
        } else if (user.bot?.owner?.type === 'user') {
          // This is a user-owned bot
          name = user.name || 'User Bot'
          displayName = `${name} (Bot)`
        } else {
          // Other bot types
          name = user.name || 'Bot'
          displayName = `${name} (Bot)`
        }
      }

      console.log(`✨ [Processed User]:`, {
        original_name: user.name,
        final_name: displayName,
        type: user.type,
        id: user.id
      })

      return {
        id: user.id,
        name: displayName,
        value: user.id,
        type: user.type || 'person',
        email: user.person?.email || undefined,
        avatar_url: user.avatar_url || undefined
      }
    })

    // Remove duplicates based on ID (in case the API returns duplicates)
    const uniqueUsers = users.filter((user, index, self) =>
      index === self.findIndex(u => u.id === user.id)
    )

    // Check for users with the same name but different IDs
    const nameGroups = uniqueUsers.reduce((acc: Record<string, NotionUser[]>, user) => {
      if (!acc[user.name]) {
        acc[user.name] = []
      }
      acc[user.name].push(user)
      return acc
    }, {})

    // Log any duplicate names
    Object.entries(nameGroups).forEach(([name, userList]) => {
      if (userList.length > 1) {
        console.warn(`⚠️ [Notion Users] Found ${userList.length} users with name "${name}":`)
        userList.forEach(user => {
          console.warn(`  - ID: ${user.id}, Type: ${user.type}, Email: ${user.email || 'N/A'}`)
        })
      }
    })

    // If there are duplicate names, add more context to distinguish them
    const finalUsers = uniqueUsers.map(user => {
      const sameNameUsers = nameGroups[user.name]
      if (sameNameUsers && sameNameUsers.length > 1) {
        // Add distinguishing information for duplicate names
        let distinguisher = ''
        if (user.email) {
          distinguisher = ` (${user.email})`
        } else if (user.type === 'bot') {
          // Already has (Bot) suffix
          distinguisher = ''
        } else {
          // Use last 4 chars of ID as last resort
          distinguisher = ` (${user.id.slice(-4)})`
        }

        return {
          ...user,
          name: user.name + distinguisher,
          label: user.name + distinguisher // Add label for dropdown display
        }
      }
      return {
        ...user,
        label: user.name // Add label for dropdown display
      }
    })

    // Sort users by name
    finalUsers.sort((a, b) => a.name.localeCompare(b.name))

    console.log(`✅ [Notion Users] Retrieved ${finalUsers.length} unique workspace users (from ${users.length} total)`)
    return finalUsers

  } catch (error: any) {
    console.error("❌ [Notion Users] Error fetching users:", error)
    throw error
  }
}