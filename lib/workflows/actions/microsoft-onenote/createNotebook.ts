import { ExecutionContext } from "@/lib/workflows/types/execution"
import { getOneNoteAccessToken, makeGraphRequest } from "./utils"

export async function onenoteCreateNotebook(
  params: {
    displayName: string
    userRole?: string
  },
  context: ExecutionContext
) {
  const { displayName, userRole = "owner" } = params

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
    const notebook = await makeGraphRequest(
      "https://graph.microsoft.com/v1.0/me/onenote/notebooks",
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          displayName
        })
      }
    )

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
    console.error("Error creating OneNote notebook:", error)
    return {
      success: false,
      error: error.message || "Failed to create OneNote notebook"
    }
  }
}