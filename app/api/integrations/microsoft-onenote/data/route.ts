import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

async function getServiceClient() {
  return await createSupabaseServiceClient()
}

async function fetchIntegration({
  integrationId,
  userId
}: {
  integrationId?: string
  userId?: string
}) {
  const supabase = await getServiceClient()
  let query = supabase
    .from('integrations')
    .select('*')
    .eq('provider', 'microsoft-onenote')
    .eq('status', 'connected')

  if (integrationId) {
    query = query.eq('id', integrationId)
  }
  if (userId) {
    query = query.eq('user_id', userId)
  }

  return query.single()
}

async function buildResponse(
  dataType: string,
  integration: any,
  options: { notebookId?: string } = {}
) {
  const { access_token } = integration

  switch (dataType) {
    case 'onenote_notebooks': {
      // Fetch notebooks from Microsoft Graph
      const response = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        logger.error('Failed to fetch OneNote notebooks', {
          status: response.status,
          statusText: response.statusText
        })
        throw new Error(`Failed to fetch notebooks: ${response.statusText}`)
      }

      const data = await response.json()
      return data.value.map((notebook: any) => ({
        value: notebook.id,
        label: notebook.displayName
      }))
    }

    case 'onenote_sections': {
      if (!options.notebookId) {
        return []
      }

      // Fetch sections for the specified notebook
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${options.notebookId}/sections`,
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        logger.error('Failed to fetch OneNote sections', {
          status: response.status,
          statusText: response.statusText,
          notebookId: options.notebookId
        })
        throw new Error(`Failed to fetch sections: ${response.statusText}`)
      }

      const data = await response.json()
      return data.value.map((section: any) => ({
        value: section.id,
        label: section.displayName
      }))
    }

    case 'onenote_pages': {
      if (!options.notebookId) {
        return []
      }

      // Build the appropriate endpoint based on what's provided
      let endpoint = `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${options.notebookId}/pages`

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        logger.error('Failed to fetch OneNote pages', {
          status: response.status,
          statusText: response.statusText
        })
        throw new Error(`Failed to fetch pages: ${response.statusText}`)
      }

      const data = await response.json()
      return data.value.map((page: any) => ({
        value: page.id,
        label: page.title
      }))
    }

    default:
      throw new Error(`Unknown data type: ${dataType}`)
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return errorResponse('Unauthorized' , 401)
    }

    const searchParams = request.nextUrl.searchParams
    const dataType = searchParams.get('dataType')
    const integrationId = searchParams.get('integrationId')
    const notebookId = searchParams.get('notebookId')

    if (!dataType) {
      return errorResponse('Missing dataType parameter' , 400)
    }

    logger.debug('OneNote data request', { dataType, integrationId, notebookId })

    const { data: integration, error } = await fetchIntegration({
      integrationId: integrationId || undefined,
      userId: user.id
    })

    if (error || !integration) {
      logger.error('Integration not found or not connected', { error })
      return errorResponse('OneNote integration not connected' , 404)
    }

    const result = await buildResponse(dataType, integration, { notebookId: notebookId || undefined })

    return jsonResponse(result)
  } catch (error) {
    logger.error('Error in OneNote data endpoint:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal server error' , 500)
  }
}
