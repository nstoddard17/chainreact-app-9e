import { ActionResult } from './core'
import { getDecryptedAccessToken } from '../executeNode'

/**
 * Create a new list in Trello
 */
export async function createTrelloList(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const { boardId, name, template } = config

    if (!boardId || !name) {
      return {
        success: false,
        output: {},
        message: "Board ID and list name are required"
      }
    }

    // Get the user's Trello access token
    const accessToken = await getDecryptedAccessToken(userId, "trello")

    // Create the list
    const listData: any = {
      name: name,
      idBoard: boardId
    }

    // If a template is provided, we'll need to copy cards from the template
    if (template) {
      // First create the list
      const createResponse = await fetch(
        `https://api.trello.com/1/lists?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(listData),
        }
      )

      if (!createResponse.ok) {
        throw new Error(`Failed to create Trello list: ${createResponse.status} ${createResponse.statusText}`)
      }

      const newList = await createResponse.json()

      // Now copy cards from the template
      const templateResponse = await fetch(
        `https://api.trello.com/1/cards/${template}?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}&fields=name,desc,pos,idLabels,idMembers`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

      if (templateResponse.ok) {
        const templateCard = await templateResponse.json()
        
        // Create a copy of the template card in the new list
        await fetch(
          `https://api.trello.com/1/cards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: templateCard.name,
              desc: templateCard.desc,
              idList: newList.id,
              pos: templateCard.pos,
              idLabels: templateCard.idLabels,
              idMembers: templateCard.idMembers,
            }),
          }
        )
      }

      return {
        success: true,
        output: {
          listId: newList.id,
          listName: newList.name,
          boardId: newList.idBoard,
          templateUsed: template,
          url: `https://trello.com/b/${newList.idBoard}`
        },
        message: `Successfully created list "${name}" with template`
      }
    } else {
      // Create list without template
      const response = await fetch(
        `https://api.trello.com/1/lists?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(listData),
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to create Trello list: ${response.status} ${response.statusText}`)
      }

      const newList = await response.json()

      return {
        success: true,
        output: {
          listId: newList.id,
          listName: newList.name,
          boardId: newList.idBoard,
          url: `https://trello.com/b/${newList.idBoard}`
        },
        message: `Successfully created list "${name}"`
      }
    }
  } catch (error: any) {
    console.error("Error creating Trello list:", error)
    return {
      success: false,
      output: {},
      message: `Failed to create Trello list: ${error.message}`
    }
  }
} 