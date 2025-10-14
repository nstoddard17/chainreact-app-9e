import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { generateSetupPackage } from '@/lib/templates/airtableSetupGenerator'
import { extractIntegrationSetups, resolvePredefinedTemplate } from '@/lib/templates/templateSetup'
import type { AirtableIntegrationSetup, TemplateIntegrationSetup } from '@/types/templateSetup'
import { createSupabaseServerClient } from '@/utils/supabase/server'

interface TemplateWithSetup {
  id: string
  airtableSetup?: unknown
  airtable_setup?: unknown
  integrationSetups?: TemplateIntegrationSetup[]
  integration_setup?: unknown
}

type SetupRequirementResponse =
  | {
      type: 'airtable'
      title?: string
      baseName: string
      tables: AirtableIntegrationSetup['tables']
      csvFiles: Array<{
        tableName: string
        filename: string
        downloadUrl: string
      }>
      guideDownloadUrl: string
      instructions: string[]
    }
  | {
      type: 'google_sheets'
      title?: string
      spreadsheetName: string
      instructions?: string[]
      sampleSheets?: Array<{
        sheetName: string
        description?: string
        downloadUrl: string
      }>
      templateUrl?: string
      resources?: TemplateIntegrationSetup['resources']
    }
  | TemplateIntegrationSetup

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
): SetupRequirementResponse {
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
    baseName,
    tables,
    csvFiles: setupPackage.csvFiles.map((file) => ({
      tableName: file.tableName,
      filename: file.filename,
      downloadUrl: `/api/templates/${templateId}/airtable-setup?table=${encodeURIComponent(file.tableName)}`,
    })),
    guideDownloadUrl: `/api/templates/${templateId}/airtable-setup?file=guide`,
    instructions,
  }
}

function buildRequirement(templateId: string, setup: TemplateIntegrationSetup): SetupRequirementResponse | null {
  switch (setup.type) {
    case 'airtable':
      return buildAirtableRequirement(templateId, setup)
    case 'google_sheets':
      return {
        type: 'google_sheets',
        title: setup.title,
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
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const setups = extractIntegrationSetups(template)

    if (!setups.length) {
      return NextResponse.json({ requirements: [] })
    }

    const requirements = setups
      .map((setup) => buildRequirement(id, setup))
      .filter((setup): setup is SetupRequirementResponse => Boolean(setup))

    return NextResponse.json({ requirements })
  } catch (error) {
    console.error('[TemplateSetup] Failed to load integration setup data:', error)
    return NextResponse.json({ error: 'Failed to load template setup requirements' }, { status: 500 })
  }
}
