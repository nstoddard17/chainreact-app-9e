/**
 * Notion Users Handler
 */

import { NotionIntegration, NotionUser, NotionDataHandler } from '../types'
import { validateNotionIntegration } from '../utils'

/**
 * Fetch Notion users (simplified implementation)
 * Note: Notion API doesn't provide a direct way to get all users in a workspace
 * We return common assignee options that users can customize
 */
export const getNotionUsers: NotionDataHandler<NotionUser> = async (integration: NotionIntegration) => {
  try {
    validateNotionIntegration(integration)
    console.log("👥 [Notion Users] Fetching user options")

    // Return common assignee options since Notion doesn't expose workspace users
    const users: NotionUser[] = [
      { 
        id: "me", 
        name: "Me", 
        value: "me", 
        type: "person"
      },
      { 
        id: "unassigned", 
        name: "Unassigned", 
        value: "unassigned", 
        type: "person"
      },
      { 
        id: "team", 
        name: "Team", 
        value: "team", 
        type: "person"
      },
      { 
        id: "anyone", 
        name: "Anyone", 
        value: "anyone", 
        type: "person"
      }
    ]

    console.log(`✅ [Notion Users] Retrieved ${users.length} user options`)
    return users

  } catch (error: any) {
    console.error("❌ [Notion Users] Error fetching users:", error)
    throw error
  }
}