import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

export async function onenoteCreateNotebook(
  params: {
    displayName: string
    userRole?: string
    overwriteIfExists?: boolean
  },
  context: ExecutionContext
) {
  const { displayName, userRole = "owner", overwriteIfExists = false } = params

  if (context.testMode) {
    console.log("[TEST MODE] Would create OneNote notebook:", { displayName, userRole })
    return {
      success: true,
      data: {
        id: "test-notebook-id",
        displayName,
        createdDateTime: new Date().toISOString(),
        webUrl: "https://onenote.com/test-notebook"
      }
    }
  }

  try {
    const accessToken = await getOneNoteAccessToken(context.userId)
    
    // Create the notebook
    let notebook
    try {
      notebook = await makeGraphRequest(
        "https://graph.microsoft.com/v1.0/me/onenote/notebooks",
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            displayName
          })
        }
      )
    } catch (err: any) {
      const message = String(err?.message || '')
      const isNameExists = message.includes('20117') || message.includes('already exists')
      if (isNameExists && overwriteIfExists) {
        // Try to find an existing notebook by name and return it
        try {
          const list = await makeGraphRequest(
            `https://graph.microsoft.com/v1.0/me/onenote/notebooks?$select=id,displayName,createdDateTime,links,webUrl&$top=200`,
            accessToken,
            { method: 'GET' }
          )
          const existing = Array.isArray(list?.value)
            ? list.value.find((n: any) => (n.displayName || '').trim().toLowerCase() === displayName.trim().toLowerCase())
            : null
          if (existing) {
            notebook = existing
          } else {
            throw err
          }
        } catch {
          throw new Error('Notebook name already exists')
        }
      } else if (isNameExists) {
        throw new Error('Notebook name already exists')
      } else {
        throw err
      }
    }

    // Verify the notebook exists and capture current user info for debugging
    try {
      const me = await makeGraphRequest(
        'https://graph.microsoft.com/v1.0/me',
        accessToken,
        { method: 'GET' }
      )
      console.log('[OneNote] Created notebook for user', {
        userId: me?.id,
        userPrincipalName: me?.userPrincipalName,
        mail: me?.mail
      })
    } catch (e) {
      console.warn('[OneNote] Failed to fetch profile after creation:', (e as any)?.message)
    }

    try {
      const confirmed = await makeGraphRequest(
        `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${notebook.id}`,
        accessToken,
        { method: 'GET' }
      )
      console.log('[OneNote] Notebook confirmation', {
        id: confirmed?.id,
        displayName: confirmed?.displayName,
        webUrl: confirmed?.links?.oneNoteWebUrl?.href || confirmed?.webUrl
      })
    } catch (e) {
      console.warn('[OneNote] Notebook not immediately visible via GET by id (may be eventual consistency).', {
        id: notebook?.id,
        message: (e as any)?.message
      })
    }

    return {
      success: true,
      data: {
        id: notebook.id,
        displayName: notebook.displayName,
        createdDateTime: notebook.createdDateTime,
        lastModifiedDateTime: notebook.lastModifiedDateTime,
        webUrl: notebook.links?.oneNoteWebUrl?.href || notebook.webUrl,
        clientUrl: notebook.links?.oneNoteClientUrl?.href
      }
    }
  } catch (error: any) {
    console.error("Error creating OneNote notebook:", error?.message || error)
    return {
      success: false,
      error: error.message || "Failed to create OneNote notebook"
    }
  }
}