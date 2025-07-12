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

      // Check if template is a list or a card
      // First try to get it as a list
      let templateListResponse = await fetch(
        `https://api.trello.com/1/lists/${template}?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}&fields=id,name,desc`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

      if (templateListResponse.ok) {
        // Template is a list, copy all cards from the template list
        const templateList = await templateListResponse.json()
        
        // Get all cards from the template list
        const cardsResponse = await fetch(
          `https://api.trello.com/1/lists/${template}/cards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}&fields=name,desc,pos,idLabels,idMembers`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        )

        let templateCards: any[] = []
        if (cardsResponse.ok) {
          templateCards = await cardsResponse.json()
          
          // Copy each card to the new list
          for (const card of templateCards) {
            await fetch(
              `https://api.trello.com/1/cards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  name: card.name,
                  desc: card.desc,
                  idList: newList.id,
                  pos: card.pos,
                  idLabels: card.idLabels,
                  idMembers: card.idMembers,
                }),
              }
            )
          }
        }

        return {
          success: true,
          output: {
            listId: newList.id,
            listName: newList.name,
            boardId: newList.idBoard,
            templateUsed: template,
            templateType: 'list',
            cardsCopied: templateCards.length,
            url: `https://trello.com/b/${newList.idBoard}`
          },
          message: `Successfully created list "${name}" with list template (${templateCards.length} cards copied)`
        }
      } else {
        // Template might be a card, try to get it as a card
        const templateCardResponse = await fetch(
          `https://api.trello.com/1/cards/${template}?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}&fields=name,desc,pos,idLabels,idMembers`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        )

        if (templateCardResponse.ok) {
          const templateCard = await templateCardResponse.json()
          
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

          return {
            success: true,
            output: {
              listId: newList.id,
              listName: newList.name,
              boardId: newList.idBoard,
              templateUsed: template,
              templateType: 'card',
              url: `https://trello.com/b/${newList.idBoard}`
            },
            message: `Successfully created list "${name}" with card template`
          }
        } else {
          // Template not found, create list without template
          return {
            success: true,
            output: {
              listId: newList.id,
              listName: newList.name,
              boardId: newList.idBoard,
              templateUsed: template,
              templateType: 'not_found',
              url: `https://trello.com/b/${newList.idBoard}`
            },
            message: `Successfully created list "${name}" (template not found)`
          }
        }
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

/**
 * Create a new card in Trello
 */
export async function createTrelloCard(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const { boardId, listId, name, desc, template } = config

    if (!boardId || !listId || !name) {
      return {
        success: false,
        output: {},
        message: "Board ID, list ID, and card name are required"
      }
    }

    // Get the user's Trello access token
    const accessToken = await getDecryptedAccessToken(userId, "trello")

    // If a template is provided, use it to populate the card
    if (template) {
      try {
        // Fetch the template card
        const templateResponse = await fetch(
          `https://api.trello.com/1/cards/${template}?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}&fields=name,desc,idLabels,idMembers,checklists`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        )

        if (templateResponse.ok) {
          const templateCard = await templateResponse.json()
          
          // Create the card with template data
          const cardData = {
            name: name || templateCard.name,
            desc: desc || templateCard.desc,
            idList: listId,
            idLabels: templateCard.idLabels || [],
            idMembers: templateCard.idMembers || []
          }

          const response = await fetch(
            `https://api.trello.com/1/cards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(cardData),
            }
          )

          if (!response.ok) {
            throw new Error(`Failed to create Trello card: ${response.status} ${response.statusText}`)
          }

          const newCard = await response.json()

          // Copy checklists from template if they exist
          if (templateCard.checklists && templateCard.checklists.length > 0) {
            for (const checklist of templateCard.checklists) {
              await fetch(
                `https://api.trello.com/1/cards/${newCard.id}/checklists?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    name: checklist.name,
                    idChecklistSource: checklist.id
                  }),
                }
              )
            }
          }

          return {
            success: true,
            output: {
              cardId: newCard.id,
              cardName: newCard.name,
              listId: newCard.idList,
              boardId: newCard.idBoard,
              templateUsed: template,
              url: newCard.url
            },
            message: `Successfully created card "${name}" using template`
          }
        } else {
          // Template not found, create card without template
          console.warn(`Template card ${template} not found, creating card without template`)
        }
      } catch (error) {
        console.warn(`Error fetching template card ${template}:`, error)
        // Continue without template
      }
    }

    // Create card without template or if template failed
    const cardData = {
      name: name,
      desc: desc || "",
      idList: listId
    }

    const response = await fetch(
      `https://api.trello.com/1/cards?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cardData),
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to create Trello card: ${response.status} ${response.statusText}`)
    }

    const newCard = await response.json()

    return {
      success: true,
      output: {
        cardId: newCard.id,
        cardName: newCard.name,
        listId: newCard.idList,
        boardId: newCard.idBoard,
        url: newCard.url
      },
      message: `Successfully created card "${name}"`
    }
  } catch (error: any) {
    console.error("Error creating Trello card:", error)
    return {
      success: false,
      output: {},
      message: `Failed to create Trello card: ${error.message}`
    }
  }
}

/**
 * Move a card to a different list in Trello
 */
export async function moveTrelloCard(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const { cardId, listId, position = "bottom" } = config

    if (!cardId || !listId) {
      return {
        success: false,
        output: {},
        message: "Card ID and target list ID are required"
      }
    }

    // Get the user's Trello access token
    const accessToken = await getDecryptedAccessToken(userId, "trello")

    // Move the card to the target list
    const moveData: any = {
      idList: listId
    }

    // Set position if specified
    if (position === "top") {
      moveData.pos = "top"
    } else if (position === "bottom") {
      moveData.pos = "bottom"
    }

    const response = await fetch(
      `https://api.trello.com/1/cards/${cardId}?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(moveData),
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to move Trello card: ${response.status} ${response.statusText}`)
    }

    const movedCard = await response.json()

    return {
      success: true,
      output: {
        cardId: movedCard.id,
        cardName: movedCard.name,
        oldListId: movedCard.idList, // This will be the new list ID after the move
        newListId: listId,
        position: position,
        url: movedCard.url
      },
      message: `Successfully moved card "${movedCard.name}" to the target list`
    }
  } catch (error: any) {
    console.error("Error moving Trello card:", error)
    return {
      success: false,
      output: {},
      message: `Failed to move Trello card: ${error.message}`
    }
  }
}