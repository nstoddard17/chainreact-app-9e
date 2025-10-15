import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { generateSetupPackage } from '@/lib/templates/airtableSetupGenerator'
import { extractIntegrationSetups, resolvePredefinedTemplate } from '@/lib/templates/templateSetup'
import type {
  AirtableIntegrationSetup,
  AirtableSetupRequirementResponse,
  TemplateIntegrationSetup,
  TemplateSetupOverview,
  TemplateSetupRequirementResponse,
} from '@/types/templateSetup'
import { createSupabaseServerClient } from '@/utils/supabase/server'

interface TemplateWithSetup {
  id: string
  airtableSetup?: unknown
  airtable_setup?: unknown
  integrationSetups?: TemplateIntegrationSetup[]
  integration_setup?: unknown
  setup_overview?: unknown
  draft_setup_overview?: unknown
  primary_setup_target?: string | null
  draft_default_field_values?: unknown
  default_field_values?: unknown
}

async function getTemplate(templateId: string): Promise<TemplateWithSetup | null> {
  const predefined = resolvePredefinedTemplate(templateId)
  if (predefined) {
    return predefined as TemplateWithSetup
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle()

  if (error) {
    console.error('[TemplateSetup] Failed to fetch template from database:', error)
    return null
  }

  return data as TemplateWithSetup | null
}

function buildAirtableRequirement(
  templateId: string,
  setup: AirtableIntegrationSetup
): AirtableSetupRequirementResponse {
  const { baseName, tables } = setup
  const setupPackage = generateSetupPackage(baseName, tables)

  const instructions = setup.instructions?.length
    ? setup.instructions
    : [
        `Create a base named "${baseName}" in Airtable`,
        'Add the tables listed below with the specified fields',
        'Import the provided CSV files before running the template',
      ]

  return {
    type: 'airtable',
    title: setup.title,
    integration: setup.integration ?? 'airtable',
    baseName,
    tables,
    csvFiles: setupPackage.csvFiles.map((file) => ({
      tableName: file.tableName,
      filename: file.filename,
      downloadUrl: `/api/templates/${templateId}/airtable-setup?table=${encodeURIComponent(file.tableName)}`,
    })),
    guideDownloadUrl: `/api/templates/${templateId}/airtable-setup?file=guide`,
    instructions,
    resources: setup.resources,
  }
}

function buildRequirement(
  templateId: string,
  setup: TemplateIntegrationSetup
): TemplateSetupRequirementResponse | null {
  switch (setup.type) {
    case 'airtable':
      return buildAirtableRequirement(templateId, setup)
    case 'google_sheets':
      return {
        type: 'google_sheets',
        title: setup.title,
        integration: setup.integration ?? 'google_sheets',
        spreadsheetName: setup.spreadsheetName,
        instructions: setup.instructions,
        sampleSheets: setup.sampleSheets,
        templateUrl: setup.templateUrl,
        resources: setup.resources,
      }
    default:
      return setup
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    cookies()
    const { id } = await context.params

    const template = await getTemplate(id)
    if (!template) {
      console.warn(`[TemplateSetup] Template not found: ${id}. Check if this template exists in database or if a workflow is referencing a deleted template.`)
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const supabase = await createSupabaseServerClient()
    const overviewSource = template.draft_setup_overview ?? template.setup_overview ?? null
    const primarySetupTarget = template.primary_setup_target ?? null

    let parsedOverview: TemplateSetupOverview | null = null
    if (overviewSource) {
      if (typeof overviewSource === 'string') {
        try {
          parsedOverview = JSON.parse(overviewSource)
        } catch (error) {
          console.error('[TemplateSetup] Failed to parse setup_overview JSON:', error)
        }
      } else {
        parsedOverview = overviewSource as TemplateSetupOverview
      }
    }

    const setups = extractIntegrationSetups(template)

    if (!setups.length) {
      return NextResponse.json({ requirements: [], overview: parsedOverview, primarySetupTarget, assets: [] })
    }

    const requirements = setups
      .map((setup) => buildRequirement(id, setup))
      .filter((setup): setup is TemplateSetupRequirementResponse => Boolean(setup))

    const { data: assetsData, error: assetsError } = await supabase
      .from('template_assets')
      .select('*')
      .eq('template_id', id)
      .order('created_at', { ascending: false })

    if (assetsError) {
      console.error('[TemplateSetup] Failed to fetch template assets:', assetsError)
    }

    const assets = (assetsData || []).map((asset) => {
      const { data: publicUrlData } = supabase.storage
        .from('template-assets')
        .getPublicUrl(asset.storage_path)

      return {
        id: asset.id,
        name: asset.name,
        asset_type: asset.asset_type,
        mime_type: asset.mime_type,
        metadata: asset.metadata,
        download_url: publicUrlData.publicUrl,
        created_at: asset.created_at,
      }
    })

    return NextResponse.json({
      requirements,
      overview: parsedOverview,
      primarySetupTarget,
      assets,
    })
  } catch (error) {
    console.error('[TemplateSetup] Failed to load integration setup data:', error)
    return NextResponse.json({ error: 'Failed to load template setup requirements' }, { status: 500 })
  }
}
