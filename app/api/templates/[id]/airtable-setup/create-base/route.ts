import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { getTemplateById } from "@/lib/templates/predefinedTemplates"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { getDecryptedAccessToken } from "@/lib/workflows/actions/core/getDecryptedAccessToken"
import type { AirtableTableSchema } from "@/types/templateSetup"

import { logger } from "@/lib/utils/logger"

interface TemplateWithSetup {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  integrations: string[]
  difficulty: string
  estimatedTime: string
  airtableSetup?: {
    baseName: string
    tables: AirtableTableSchema[]
  }
}

async function loadTemplate(templateId: string): Promise<TemplateWithSetup | null> {
  const predefined = getTemplateById(templateId)
  if (predefined) {
    return predefined as TemplateWithSetup
  }

  const supabase = await createSupabaseRouteHandlerClient()
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle()

  if (error) {
    logger.error("[CreateAirtableBase] Failed to fetch template:", error)
    return null
  }

  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    description: data.description || "",
    category: data.category || "Other",
    tags: data.tags || [],
    integrations: [],
    difficulty: data.difficulty || "intermediate",
    estimatedTime: data.estimated_time || "10 mins",
    airtableSetup: data.airtable_setup || undefined,
  }
}

type AirtableFieldDefinition = {
  name: string
  type: string
  description?: string
  typeOptions?: Record<string, any>
}

function mapField(field: AirtableTableSchema["fields"][number]): AirtableFieldDefinition {
  const base: AirtableFieldDefinition = {
    name: field.name,
  }

  if (field.description) {
    base.description = field.description
  }

  switch (field.type) {
    case "singleLineText":
      base.type = "singleLineText"
      break
    case "longText":
      base.type = "multilineText"
      break
    case "singleSelect":
      base.type = "singleSelect"
      if (field.options?.length) {
        base.typeOptions = {
          choices: field.options.map((option) => ({ name: option })),
        }
      }
      break
    case "multipleSelects":
      base.type = "multipleSelects"
      if (field.options?.length) {
        base.typeOptions = {
          choices: field.options.map((option) => ({ name: option })),
        }
      }
      break
    case "number":
      base.type = "number"
      base.typeOptions = { precision: 0 }
      break
    case "email":
      base.type = "email"
      break
    case "url":
      base.type = "url"
      break
    case "checkbox":
      base.type = "checkbox"
      break
    case "date":
      base.type = "date"
      break
    case "phoneNumber":
      base.type = "phoneNumber"
      break
    case "multipleAttachments":
      base.type = "multipleAttachments"
      break
    default:
      base.type = "singleLineText"
      break
  }

  return base
}

async function resolveWorkspaceId(
  accessToken: string,
  explicit: string | null | undefined,
  integrationMetadata?: Record<string, any> | null
): Promise<string | null> {
  if (explicit?.trim()) {
    return explicit.trim()
  }

  // Check integration metadata first (we may have stored a preferred workspace at connect time)
  const metadataWorkspace = integrationMetadata?.workspaceId || integrationMetadata?.workspace_id
  if (typeof metadataWorkspace === 'string' && metadataWorkspace.trim().length > 0) {
    logger.info('[CreateAirtableBase] Using workspace from integration metadata')
    return metadataWorkspace.trim()
  }

  const fetchWorkspaces = async () => {
    try {
      logger.info('[CreateAirtableBase] Attempting to fetch workspaces from Meta API...')
      const res = await fetch("https://api.airtable.com/v0/meta/workspaces", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        logger.warn(`[CreateAirtableBase] Failed to list workspaces (${res.status}): ${errText}`)
        return null
      }

      const data = await res.json()
      logger.info(`[CreateAirtableBase] Workspaces response:`, JSON.stringify(data).substring(0, 500))
      const workspaces: Array<{ id: string; name?: string; permissionLevel?: string }> = data?.workspaces || []
      const preferred = workspaces.find((ws) =>
        ["create", "edit", "owner"].includes((ws.permissionLevel || "").toLowerCase())
      )

      if (preferred) {
        logger.info(`[CreateAirtableBase] Found preferred workspace: ${preferred.id}`)
        return preferred.id
      }
      if (workspaces.length > 0) {
        logger.info(`[CreateAirtableBase] Using first workspace: ${workspaces[0].id}`)
        return workspaces[0].id
      }
    } catch (error) {
      logger.error("[CreateAirtableBase] Workspace lookup error:", error)
    }
    return null
  }

  let workspaceId = await fetchWorkspaces()
  if (workspaceId) {
    logger.info(`[CreateAirtableBase] Successfully resolved workspace: ${workspaceId}`)
    return workspaceId
  }

  logger.info('[CreateAirtableBase] Workspace fetch failed, trying bases endpoint to extract workspace...')
  try {
    // Try getting workspace from user's existing bases
    const basesRes = await fetch("https://api.airtable.com/v0/meta/bases", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (basesRes.ok) {
      const basesData = await basesRes.json()
      logger.info('[CreateAirtableBase] Bases response:', JSON.stringify(basesData))
      logger.info('[CreateAirtableBase] Number of bases:', basesData?.bases?.length || 0)

      // Extract workspace ID from the first base
      const bases = basesData?.bases || []
      if (bases.length > 0) {
        // Look for a base where user has create permissions
        const writableBase = bases.find((b: any) =>
          ["create", "edit", "owner"].includes((b.permissionLevel || "").toLowerCase())
        )
        const base = writableBase || bases[0]

        // Try fetching full details of this base to get workspace info
        logger.info(`[CreateAirtableBase] Fetching full details for base: ${base.id}`)
        try {
          const baseDetailsRes = await fetch(`https://api.airtable.com/v0/meta/bases/${base.id}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            cache: "no-store",
          })

          if (baseDetailsRes.ok) {
            const baseDetails = await baseDetailsRes.json()
            logger.info('[CreateAirtableBase] Full base details:', JSON.stringify(baseDetails))

            // Check for workspace ID in the detailed response
            const workspaceFromDetails =
              baseDetails.workspaceId ||
              baseDetails.workspace_id ||
              baseDetails.workspace?.id ||
              baseDetails.permissionLevel?.workspaceId

            if (workspaceFromDetails) {
              logger.info(`[CreateAirtableBase] Extracted workspace from base details: ${workspaceFromDetails}`)
              return workspaceFromDetails
            }

            logger.info('[CreateAirtableBase] Available base details keys:', Object.keys(baseDetails).join(', '))
          } else {
            logger.warn(`[CreateAirtableBase] Failed to fetch base details (${baseDetailsRes.status})`)
          }
        } catch (detailsError) {
          logger.error('[CreateAirtableBase] Error fetching base details:', detailsError)
        }

        logger.warn('[CreateAirtableBase] Could not extract workspace ID from any source')
      } else {
        logger.warn('[CreateAirtableBase] User has no bases - cannot extract workspace ID')
      }
    } else {
      const errText = await basesRes.text().catch(() => basesRes.statusText)
      logger.warn(`[CreateAirtableBase] Bases endpoint failed (${basesRes.status}): ${errText}`)
    }
  } catch (error) {
    logger.error('[CreateAirtableBase] Bases lookup error:', error)
  }

  logger.info('[CreateAirtableBase] Trying whoami endpoint as final fallback...')
  try {
    const whoamiRes = await fetch("https://api.airtable.com/v0/meta/whoami", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (whoamiRes.ok) {
      const whoami = await whoamiRes.json()
      logger.info('[CreateAirtableBase] whoami full response:', JSON.stringify(whoami))
      logger.info('[CreateAirtableBase] whoami response keys:', Object.keys(whoami).join(', '))

      // Try multiple possible field names
      const workspaceId =
        whoami?.defaultWorkspaceId ||
        whoami?.default_workspace_id ||
        whoami?.workspaceId ||
        whoami?.workspace_id

      if (workspaceId) {
        logger.info(`[CreateAirtableBase] Using workspace from whoami: ${workspaceId}`)
        return workspaceId
      }

      // Try workspace IDs array
      const accessible = Array.isArray(whoami?.workspaceIds)
        ? whoami.workspaceIds
        : Array.isArray(whoami?.workspace_ids)
          ? whoami.workspace_ids
          : []

      logger.info('[CreateAirtableBase] Workspace IDs array length:', accessible.length)

      if (accessible.length > 0) {
        logger.info(`[CreateAirtableBase] Using first workspace from whoami list: ${accessible[0]}`)
        return accessible[0]
      }

      logger.warn('[CreateAirtableBase] whoami response contained no workspace information')
      logger.warn('[CreateAirtableBase] This might indicate the token lacks schema.bases:read scope or the account has no workspaces')
    } else {
      const errText = await whoamiRes.text().catch(() => whoamiRes.statusText)
      logger.warn(`[CreateAirtableBase] whoami fallback failed (${whoamiRes.status}): ${errText}`)
    }
  } catch (error) {
    logger.error('[CreateAirtableBase] whoami fallback error:', error)
  }

  logger.error('[CreateAirtableBase] All workspace resolution methods failed')
  return null
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    cookies()
    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    const requestedWorkspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null
    const baseNameOverride = typeof body.baseName === "string" ? body.baseName.trim() : null

    const template = await loadTemplate(id)

    if (!template || !template.airtableSetup) {
      return NextResponse.json(
        { error: "Template with Airtable setup not found" },
        { status: 404 }
      )
    }

    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let accessToken: string
    let integrationMetadata: Record<string, any> | null = null
    try {
      accessToken = await getDecryptedAccessToken(user.id, "airtable")

      const { data: integrationRow } = await supabase
        .from('integrations')
        .select('metadata')
        .eq('user_id', user.id)
        .eq('provider', 'airtable')
        .maybeSingle()

      if (integrationRow?.metadata) {
        integrationMetadata = integrationRow.metadata as Record<string, any>
      }
    } catch (tokenError: any) {
      logger.error("[CreateAirtableBase] Failed to load Airtable token:", tokenError)
      return NextResponse.json(
        { error: tokenError.message || "Airtable integration not connected" },
        { status: 400 }
      )
    }

    const workspaceId = await resolveWorkspaceId(accessToken, requestedWorkspaceId, integrationMetadata)

  // Build payload - workspace ID is optional for personal accounts
  const payload: any = {
    name: baseNameOverride || template.airtableSetup.baseName,
    tables: template.airtableSetup.tables.map((table) => ({
      name: table.tableName,
      description: table.description || undefined,
      fields: table.fields.map(mapField),
    })),
  }

  if (workspaceId) {
    logger.info(`[CreateAirtableBase] Using resolved workspace ID: ${workspaceId}`)
    payload.workspaceId = workspaceId
  } else {
    logger.info('[CreateAirtableBase] No workspace ID resolved; attempting to detect personal workspace for schema.bases.write')
    try {
      const accountsRes = await fetch('https://api.airtable.com/v0/meta/accounts', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      })

      if (accountsRes.ok) {
        const accounts = await accountsRes.json()
        logger.info('[CreateAirtableBase] meta/accounts response:', JSON.stringify(accounts))
        const personalWorkspaceId = accounts?.personalWorkspaceId || accounts?.personal_workspace_id
        if (personalWorkspaceId) {
          logger.info(`[CreateAirtableBase] Using personal workspace from accounts endpoint: ${personalWorkspaceId}`)
          payload.workspaceId = personalWorkspaceId
        }
      } else {
        const errText = await accountsRes.text().catch(() => accountsRes.statusText)
        logger.warn(`[CreateAirtableBase] meta/accounts lookup failed (${accountsRes.status}): ${errText}`)
      }
    } catch (accountsError) {
      logger.error('[CreateAirtableBase] accounts endpoint error:', accountsError)
    }
  }

    logger.info('[CreateAirtableBase] Sending payload to Airtable:', JSON.stringify(payload))

    const response = await fetch("https://api.airtable.com/v0/meta/bases", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    logger.info(`[CreateAirtableBase] Airtable response status: ${response.status}`)

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      const message =
        errorPayload?.error?.message ||
        errorPayload?.message ||
        `Airtable API error (status ${response.status})`
      logger.error("[CreateAirtableBase] Airtable API error response:", JSON.stringify(errorPayload))

      // Check if it's a scope issue
      if (response.status === 403 || (errorPayload?.error?.type === "INVALID_PERMISSIONS")) {
        return NextResponse.json({
          error: "Missing required Airtable permissions",
          details: {
            message: "Your Airtable connection is missing the 'schema.bases:write' scope needed to create bases.",
            suggestion: "Please disconnect and reconnect your Airtable integration to grant all required permissions.",
            currentError: message
          }
        }, { status: 403 })
      }

      return NextResponse.json({
        error: message,
        details: errorPayload
      }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json({
      base: {
        id: data?.id,
        name: data?.name ?? payload.name,
        workspaceId,
        createdTables: payload.tables.map((table) => table.name),
        url: data?.sharing?.sharedBaseUrl || (data?.id ? `https://airtable.com/${data.id}` : null),
      },
    })
  } catch (error: any) {
    logger.error("[CreateAirtableBase] Unexpected error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to create Airtable base" },
      { status: 500 }
    )
  }
}
