import { ActionResult } from './core'
import { getDecryptedAccessToken } from '../executeNode'
import { resolveValue } from './core/resolveValue'

/**
 * Create a new list in Trello
 */
export async function createTrelloList(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve any workflow variables in the config
    const resolvedConfig = resolveValue(config, { input })
    const { boardId, name, template, position, specificPosition } = resolvedConfig

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

    // Handle positioning - check for custom position first
    if (position === "custom" && specificPosition && !isNaN(parseInt(specificPosition))) {
      // User selected custom and provided exact position number
      const posNum = parseInt(specificPosition)
      if (posNum === 1) {
        listData.pos = "top"
      } else {
        // For position 2, 3, 4, etc., we need to calculate relative to existing lists
        // First, get all lists on the board to determine proper positioning
        const listsResponse = await fetch(
          `https://api.trello.com/1/boards/${boardId}/lists?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}&filter=open`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        )

        if (listsResponse.ok) {
          const existingLists = await listsResponse.json()
          const sortedLists = existingLists.sort((a: any, b: any) => a.pos - b.pos)

          if (posNum - 1 < sortedLists.length) {
            // Position between existing lists
            const targetIndex = posNum - 1
            if (targetIndex === 0) {
              // After first list
              listData.pos = (sortedLists[0].pos + sortedLists[1].pos) / 2
            } else if (targetIndex < sortedLists.length) {
              // Between two lists
              listData.pos = (sortedLists[targetIndex - 1].pos + sortedLists[targetIndex].pos) / 2
            } else {
              // Beyond current lists, add at end
              listData.pos = "bottom"
            }
          } else {
            // Position is beyond current number of lists, add at end
            listData.pos = "bottom"
          }
        } else {
          // Fallback if we can't get lists
          listData.pos = posNum * 65536
        }
      }
    } else if (position && position !== "custom") {
      // Use the dropdown position selection (excluding custom)
      if (position === "top" || position === "bottom") {
        listData.pos = position
      } else if (position === "after_first" || position === "before_last" || position === "middle") {
        // Get all lists to calculate relative positions
        const listsResponse = await fetch(
          `https://api.trello.com/1/boards/${boardId}/lists?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}&filter=open`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        )

        if (listsResponse.ok) {
          const existingLists = await listsResponse.json()
          const sortedLists = existingLists.sort((a: any, b: any) => a.pos - b.pos)

          if (sortedLists.length > 0) {
            switch (position) {
              case "after_first":
                if (sortedLists.length > 1) {
                  listData.pos = (sortedLists[0].pos + sortedLists[1].pos) / 2
                } else {
                  listData.pos = sortedLists[0].pos + 65536
                }
                break
              case "before_last":
                if (sortedLists.length > 1) {
                  listData.pos = (sortedLists[sortedLists.length - 2].pos + sortedLists[sortedLists.length - 1].pos) / 2
                } else {
                  listData.pos = sortedLists[0].pos / 2
                }
                break
              case "middle":
                const middleIndex = Math.floor(sortedLists.length / 2)
                if (middleIndex > 0 && middleIndex < sortedLists.length) {
                  listData.pos = (sortedLists[middleIndex - 1].pos + sortedLists[middleIndex].pos) / 2
                } else {
                  listData.pos = "bottom"
                }
                break
            }
          } else {
            // No existing lists, just add at bottom
            listData.pos = "bottom"
          }
        } else {
          // Fallback to bottom if we can't get lists
          listData.pos = "bottom"
        }
      }
    } else {
      // Default to bottom (last position) if not specified
      listData.pos = "bottom"
    }

    // If a template is provided, we'll need to copy cards from the template
    if (template) {
      // First create the list
      const createResponse = await fetch(
        `https://api.trello.com/1/lists?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
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
      const templateListResponse = await fetch(
        `https://api.trello.com/1/lists/${template}?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}&fields=id,name,desc`,
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
          `https://api.trello.com/1/lists/${template}/cards?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}&fields=name,desc,pos,idLabels,idMembers`,
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
              `https://api.trello.com/1/cards?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
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
          message: `Successfully created list "${name}" with list template (${templateCards.length} cards copied)${position === 'custom' && specificPosition ? ` at position ${specificPosition}` : position && position !== 'custom' ? ` (${position.replace('_', ' ')})` : ''}`
        }
      } 
        // Template might be a card, try to get it as a card
        const templateCardResponse = await fetch(
          `https://api.trello.com/1/cards/${template}?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}&fields=name,desc,pos,idLabels,idMembers`,
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
            `https://api.trello.com/1/cards?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
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
            message: `Successfully created list "${name}" with card template${position === 'custom' && specificPosition ? ` at position ${specificPosition}` : position && position !== 'custom' ? ` (${position.replace('_', ' ')})` : ''}`
          }
        } 
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
            message: `Successfully created list "${name}" (template not found)${position === 'custom' && specificPosition ? ` at position ${specificPosition}` : position && position !== 'custom' ? ` (${position.replace('_', ' ')})` : ''}`
          }
        
      
    } 
      // Create list without template
      const response = await fetch(
        `https://api.trello.com/1/lists?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
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
        message: `Successfully created list "${name}"${position === 'custom' && specificPosition ? ` at position ${specificPosition}` : position && position !== 'custom' ? ` (${position.replace('_', ' ')})` : ''}`
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
    // Resolve any workflow variables in the config
    const resolvedConfig = resolveValue(config, { input })
    const {
      boardId,
      listId,
      name,
      desc,
      pos,
      due,
      dueComplete,
      start,
      idMembers,
      idLabels,
      attachment,
      address,
      locationName,
      coordinates,
      idCardSource,
      keepFromSource
    } = resolvedConfig

    if (!boardId || !listId || !name) {
      return {
        success: false,
        output: {},
        message: "Board ID, list ID, and card name are required"
      }
    }

    // Get the user's Trello access token
    const accessToken = await getDecryptedAccessToken(userId, "trello")

    // Build card data with all specified fields
    const cardData: any = {
      name: name,
      desc: desc || "",
      idList: listId
    }

    // Add optional fields if provided
    if (pos) cardData.pos = pos

    // Handle date fields - ensure they're in ISO format for Trello API
    if (due) {
      // If it's already a Date object or ISO string, use it; otherwise try to parse it
      const dueDate = due instanceof Date ? due : new Date(due)
      cardData.due = dueDate.toISOString()
    }
    if (dueComplete !== undefined) cardData.dueComplete = dueComplete
    if (start) {
      // If it's already a Date object or ISO string, use it; otherwise try to parse it
      const startDate = start instanceof Date ? start : new Date(start)
      cardData.start = startDate.toISOString()
    }
    if (idMembers && idMembers.length > 0) cardData.idMembers = idMembers.join(',')
    if (idLabels && idLabels.length > 0) cardData.idLabels = idLabels.join(',')

    // Note: Attachments are handled after card creation via separate API call
    // The Trello API doesn't support adding attachments during card creation

    if (address) cardData.address = address
    if (locationName) cardData.locationName = locationName
    // Only add coordinates if it's a valid string with lat,long format
    if (coordinates && typeof coordinates === 'string' && coordinates.trim()) {
      // Validate coordinates format (should be "latitude,longitude")
      const coordPattern = /^-?\d+\.?\d*,-?\d+\.?\d*$/
      if (coordPattern.test(coordinates.trim())) {
        cardData.coordinates = coordinates.trim()
      } else {
        console.warn(`[Trello] Invalid coordinates format: ${coordinates}. Expected "latitude,longitude"`)
      }
    }

    // Handle copying from another card
    if (idCardSource) {
      cardData.idCardSource = idCardSource
      if (keepFromSource && keepFromSource.length > 0) {
        cardData.keepFromSource = keepFromSource.join(',')
      }
    }

    const response = await fetch(
      `https://api.trello.com/1/cards?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cardData),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Trello API error: ${response.status} - ${errorText}`)
      throw new Error(`Failed to create Trello card: ${response.status} ${response.statusText}`)
    }

    const newCard = await response.json()

    // Handle file attachment if provided (after card creation)
    if (attachment) {
      console.log('[Trello] Attachment data received:', {
        type: typeof attachment,
        hasMode: !!attachment.mode,
        mode: attachment.mode,
        hasFile: !!attachment.file,
        hasUrl: !!attachment.url,
        fileUrl: `${attachment.file?.url?.substring(0, 50) }...`, // Show first 50 chars
        fullAttachment: `${JSON.stringify(attachment).substring(0, 200) }...`
      });

      try {
        // Check if it's a file upload with base64 data
        if (attachment.mode === 'upload' && attachment.file?.url?.startsWith('data:')) {
          console.log('[Trello] ✅ Using NEW direct file upload to Trello method...');

          // Extract base64 data and metadata
          const base64Data = attachment.file.url;
          const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);

          if (matches) {
            const mimeType = matches[1];
            const base64Content = matches[2];
            const buffer = Buffer.from(base64Content, 'base64');
            const fileName = attachment.file?.name || 'attachment';

            console.log('[Trello] Uploading file directly to Trello:', {
              fileName,
              mimeType,
              size: buffer.length
            });

            // Try using Node.js built-in FormData if available (Node 18+)
            // Otherwise fall back to form-data package
            let form;
            let formHeaders;

            try {
              // Try native FormData first (available in Node.js 18+)
              if (typeof FormData !== 'undefined') {
                console.log('[Trello] Using native FormData');
                form = new FormData();
                // Create a Blob from the buffer
                const blob = new Blob([buffer], { type: mimeType });
                form.append('file', blob, fileName);
                formHeaders = {};
              } else {
                throw new Error('Native FormData not available');
              }
            } catch (e) {
              // Fall back to form-data package
              console.log('[Trello] Using form-data package');
              const FormDataPackage = require('form-data');
              form = new FormDataPackage();

              // IMPORTANT: Trello expects the file field to be named 'file'
              // and requires proper filename in the Content-Disposition header
              form.append('file', buffer, {
                filename: fileName,
                contentType: mimeType,
                knownLength: buffer.length
              });

              // Get the form headers with proper boundary
              formHeaders = form.getHeaders();
            }

            console.log('[Trello] Form headers for upload:', formHeaders);

            // Direct file upload to Trello
            // Note: We need to include name and mimeType as query parameters, not form fields
            const attachmentResponse = await fetch(
              `https://api.trello.com/1/cards/${newCard.id}/attachments?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}&name=${encodeURIComponent(fileName)}&mimeType=${encodeURIComponent(mimeType)}`,
              {
                method: 'POST',
                body: form,
                headers: {
                  ...formHeaders,
                  'Accept': 'application/json'
                }
              }
            );

            if (attachmentResponse.ok) {
              const attachmentResult = await attachmentResponse.json();
              console.log('[Trello] ✅ File uploaded directly to Trello:', {
                id: attachmentResult.id,
                name: attachmentResult.name,
                fileName: attachmentResult.fileName,
                mimeType: attachmentResult.mimeType,
                url: attachmentResult.url,
                bytes: attachmentResult.bytes
              });

              console.log('[Trello] File is now stored on Trello servers - no Supabase storage needed!');
            } else {
              const errorText = await attachmentResponse.text();
              console.error('[Trello] Failed to upload file directly:', attachmentResponse.status, errorText);

              // Fallback to URL attachment if direct upload fails
              console.log('[Trello] ⚠️ Direct upload failed! Attempting fallback to Supabase + URL attachment method...');

              // Upload to Supabase storage as fallback
              const { createClient } = require('@supabase/supabase-js');
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
              const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              const supabase = createClient(supabaseUrl!, supabaseKey!);

              // Ensure the trello-attachments bucket exists and is public
              const bucketName = 'trello-attachments';
              const { data: buckets } = await supabase.storage.listBuckets();
              const bucketExists = buckets?.some(b => b.name === bucketName);

              if (!bucketExists) {
                console.log('[Trello] Creating public bucket for FALLBACK attachments');
                await supabase.storage.createBucket(bucketName, {
                  public: true,
                  fileSizeLimit: 50 * 1024 * 1024 // 50MB limit
                });
              }

              // Generate a unique filename
              const timestamp = Date.now();
              const fileExt = fileName?.split('.').pop() || 'bin';
              const cleanFileName = fileName?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'attachment';
              const storageName = `${userId}/${timestamp}-${cleanFileName}`;

              // Upload to Supabase storage
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(storageName, buffer, {
                  contentType: mimeType,
                  upsert: false
                });

              if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                  .from(bucketName)
                  .getPublicUrl(storageName);

                // Try URL attachment as fallback
                const urlAttachResponse = await fetch(
                  `https://api.trello.com/1/cards/${newCard.id}/attachments?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      url: publicUrl,
                      name: fileName,
                      mimeType: mimeType
                    })
                  }
                );

                if (urlAttachResponse.ok) {
                  console.log('[Trello] Fallback URL attachment successful');
                } else {
                  console.error('[Trello] Fallback also failed');
                }
              }
            }
          }
        }
        // Check if it's a direct URL attachment
        else if (attachment.mode === 'url' && attachment.url) {
          const attachmentUrl = attachment.url;
          const fileName = attachment.name || 'URL Attachment';

          console.log('[Trello] Adding URL attachment:', attachmentUrl);

          const attachmentResponse = await fetch(
            `https://api.trello.com/1/cards/${newCard.id}/attachments?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: attachmentUrl,
                name: fileName
              })
            }
          );

          if (attachmentResponse.ok) {
            const attachmentResult = await attachmentResponse.json();
            console.log('[Trello] URL attachment added successfully:', attachmentResult.name);
          } else {
            const errorText = await attachmentResponse.text();
            console.error('[Trello] Failed to add URL attachment:', attachmentResponse.status, errorText);
          }
        } else {
          console.warn('[Trello] Could not process attachment:', attachment);
        }
      } catch (error) {
        console.error('[Trello] Error adding attachment to card:', error);
        // Don't throw - card was created successfully, just attachment failed
      }
    }

    return {
      success: true,
      output: {
        id: newCard.id,
        name: newCard.name,
        url: newCard.url,
        shortUrl: newCard.shortUrl,
        idList: newCard.idList,
        idBoard: newCard.idBoard,
        desc: newCard.desc,
        due: newCard.due,
        start: newCard.start,
        closed: newCard.closed,
        idMembers: newCard.idMembers,
        idLabels: newCard.idLabels,
        badges: newCard.badges,
        pos: newCard.pos
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
    // Resolve any workflow variables in the config
    const resolvedConfig = resolveValue(config, { input })
    const { cardId, listId, position = "bottom" } = resolvedConfig

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
      `https://api.trello.com/1/cards/${cardId}?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
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

/**
 * Create a new board in Trello
 */
export async function createTrelloBoard(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    console.log("[Trello] createTrelloBoard called with config:", config)

    // Resolve any workflow variables in the config
    const resolvedConfig = resolveValue(config, { input })
    console.log("[Trello] Resolved config:", resolvedConfig)

    const { name, description, template, sourceBoardId, visibility } = resolvedConfig

    if (!name) {
      return {
        success: false,
        output: {},
        message: "Board name is required"
      }
    }

    // Get the user's Trello access token
    const accessToken = await getDecryptedAccessToken(userId, "trello")

    // Build the board creation data
    const boardData: any = {
      name: name,
      defaultLists: false // Don't create default lists, we'll handle templates separately
    }

    // Add optional description
    if (description) {
      boardData.desc = description
    }

    // If copying from an existing board, use Trello's native idBoardSource
    if (sourceBoardId) {
      console.log(`[Trello] Using native API to copy from board: ${sourceBoardId}`);
      boardData.idBoardSource = sourceBoardId;
      boardData.keepFromSource = "all"; // Copy everything: lists, cards, labels, members, etc.
      boardData.defaultLists = false; // Don't add default lists when copying
    }

    // Set board permission level based on visibility
    if (visibility) {
      switch (visibility) {
        case 'private':
          boardData.prefs_permissionLevel = 'private'
          break
        case 'public':
          boardData.prefs_permissionLevel = 'public'
          break
        case 'workspace':
          boardData.prefs_permissionLevel = 'org'
          break
        default:
          boardData.prefs_permissionLevel = 'private'
      }
    }

    // Create the board (with or without copying)
    const createResponse = await fetch(
      `https://api.trello.com/1/boards?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(boardData),
      }
    )

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error(`Trello API error: ${createResponse.status} - ${errorText}`)
      throw new Error(`Failed to create Trello board: ${createResponse.status} ${createResponse.statusText}`)
    }

    const newBoard = await createResponse.json()

    // If we copied from an existing board, we're done (Trello API handled everything)
    if (sourceBoardId) {
      return {
        success: true,
        output: {
          id: newBoard.id,
          name: newBoard.name,
          desc: newBoard.desc,
          url: newBoard.url,
          shortUrl: newBoard.shortUrl,
          closed: newBoard.closed,
          idOrganization: newBoard.idOrganization,
          prefs: newBoard.prefs,
          copiedFromBoardId: sourceBoardId
        },
        message: `Successfully created board "${name}" by copying from existing board`
      };
    }

    // If a template was selected, apply it by creating the appropriate lists
    if (template) {

      // Map template names to default list configurations
      const templateLists: Record<string, string[]> = {
        'basic': ['To Do', 'Doing', 'Done'],
        'kanban': ['Backlog', 'Design', 'To Do', 'In Progress', 'Code Review', 'Testing', 'Done'],
        'project-management': ['Resources', 'To Do', 'In Progress', 'Review', 'Done', 'Archive'],
        'agile-board': ['Product Backlog', 'Sprint Backlog', 'In Progress', 'Code Review', 'Testing', 'Done'],
        'simple-project-board': ['Ideas', 'To Do', 'Doing', 'Done'],
        'weekly-planner': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Weekend', 'Notes']
      }

      const listsToCreate = templateLists[template] || []

      // Define sample cards for templates
      const templateCards: Record<string, Record<string, { name: string; desc?: string }[]>> = {
        'kanban': {
          'Backlog': [
            { name: 'Research user requirements', desc: 'Gather and document user needs and expectations' },
            { name: 'Define project scope', desc: 'Clearly outline project boundaries and deliverables' },
            { name: 'Create technical specifications', desc: 'Document technical requirements and architecture' }
          ],
          'Design': [
            { name: 'Create wireframes', desc: 'Develop initial visual representations of the interface' },
            { name: 'Design system components', desc: 'Build reusable UI components' }
          ],
          'To Do': [
            { name: 'Set up development environment', desc: 'Configure tools and dependencies' },
            { name: 'Initialize project repository', desc: 'Set up version control and project structure' }
          ],
          'In Progress': [
            { name: 'Implement authentication', desc: 'Build user login and registration system' }
          ],
          'Code Review': [
            { name: 'Review database schema', desc: 'Validate database design and relationships' }
          ],
          'Testing': [
            { name: 'Unit test coverage', desc: 'Write tests for critical functions' }
          ],
          'Done': [
            { name: 'Project kickoff meeting ✓', desc: 'Initial team alignment completed' }
          ]
        },
        'agile-board': {
          'Product Backlog': [
            { name: 'User Story: As a user, I want to log in', desc: 'Acceptance criteria: Email/password login' },
            { name: 'User Story: As a user, I want to reset my password', desc: 'Acceptance criteria: Email verification required' }
          ],
          'Sprint Backlog': [
            { name: 'Task: Database schema design', desc: 'Design tables for user management' },
            { name: 'Task: API endpoint planning', desc: 'Define RESTful API structure' }
          ]
        }
      };

      // Create lists based on the template
      for (let i = 0; i < listsToCreate.length; i++) {
        const listName = listsToCreate[i]
        const createListResponse = await fetch(
          `https://api.trello.com/1/lists?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: listName,
              idBoard: newBoard.id,
              pos: (i + 1) * 65536 // Position lists in order
            }),
          }
        );

        // If list created successfully and we have sample cards for this template/list
        if (createListResponse.ok && templateCards[template]?.[listName]) {
          const newList = await createListResponse.json();
          const cardsToCreate = templateCards[template][listName];

          // Create sample cards for this list
          for (let j = 0; j < cardsToCreate.length; j++) {
            const card = cardsToCreate[j];
            await fetch(
              `https://api.trello.com/1/cards?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  name: card.name,
                  desc: card.desc || '',
                  idList: newList.id,
                  pos: (j + 1) * 65536
                }),
              }
            );
          }
        }
      }
    } else {
      // Create default lists if no template specified
      const defaultLists = ['To Do', 'Doing', 'Done']
      for (let i = 0; i < defaultLists.length; i++) {
        await fetch(
          `https://api.trello.com/1/lists?key=${process.env.TRELLO_CLIENT_ID}&token=${accessToken}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: defaultLists[i],
              idBoard: newBoard.id,
              pos: (i + 1) * 65536
            }),
          }
        )
      }
    }

    return {
      success: true,
      output: {
        id: newBoard.id,
        name: newBoard.name,
        desc: newBoard.desc,
        url: newBoard.url,
        shortUrl: newBoard.shortUrl,
        closed: newBoard.closed,
        idOrganization: newBoard.idOrganization,
        prefs: newBoard.prefs,
        template: template || 'default'
      },
      message: `Successfully created board "${name}"${template ? ` with ${template} template` : ''}`
    }
  } catch (error: any) {
    console.error("Error creating Trello board:", error)
    return {
      success: false,
      output: {},
      message: `Failed to create Trello board: ${error.message}`
    }
  }
}