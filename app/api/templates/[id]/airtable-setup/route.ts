import { NextRequest, NextResponse } from 'next/server'
import { getTemplateById } from '@/lib/templates/predefinedTemplates'
import { generateSetupPackage } from '@/lib/templates/airtableSetupGenerator'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    cookies()
    const { id: templateId } = await context.params

    // First try predefined templates
    let template = getTemplateById(templateId)

    // If not found in predefined, check database
    if (!template) {
      const supabase = await createSupabaseServerClient()
      const { data: dbTemplate } = await supabase
        .from('templates')
        .select('*')
        .eq('id', templateId)
        .single()

      if (dbTemplate) {
        template = {
          id: dbTemplate.id,
          name: dbTemplate.name,
          description: dbTemplate.description || '',
          category: dbTemplate.category || 'Other',
          tags: dbTemplate.tags || [],
          integrations: [], // Not stored in DB templates
          difficulty: 'intermediate' as const,
          estimatedTime: '10 mins',
          workflow_json: {
            nodes: dbTemplate.nodes || [],
            edges: dbTemplate.connections || []
          },
          airtableSetup: dbTemplate.airtable_setup || undefined
        }
      }
    }

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    if (!template.airtableSetup) {
      return NextResponse.json(
        { error: 'This template does not require Airtable setup' },
        { status: 404 }
      )
    }

    const { baseName, tables } = template.airtableSetup
    const setupPackage = generateSetupPackage(baseName, tables)

    // Check if a specific file is requested via query param
    const url = new URL(request.url)
    const fileType = url.searchParams.get('file')

    if (fileType === 'guide') {
      // Return markdown guide
      return new NextResponse(setupPackage.markdownGuide, {
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename="${baseName.toLowerCase().replace(/\s+/g, '-')}-setup-guide.md"`
        }
      })
    }

    // Check if a specific table CSV is requested
    const tableName = url.searchParams.get('table')
    if (tableName) {
      const csvFile = setupPackage.csvFiles.find(f => f.tableName === tableName)
      if (!csvFile) {
        return NextResponse.json(
          { error: 'Table not found' },
          { status: 404 }
        )
      }

      return new NextResponse(csvFile.content, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${csvFile.filename}"`
        }
      })
    }

    // Return setup information as JSON (for UI to display)
    return NextResponse.json({
      setupType: 'airtable' as const,
      baseName,
      tables: tables.map(t => ({
        tableName: t.tableName,
        description: t.description,
        fieldCount: t.fields.length,
        fields: t.fields
      })),
      csvFiles: setupPackage.csvFiles.map(f => ({
        tableName: f.tableName,
        filename: f.filename,
        downloadUrl: `/api/templates/${templateId}/airtable-setup?table=${encodeURIComponent(f.tableName)}`
      })),
      guideDownloadUrl: `/api/templates/${templateId}/airtable-setup?file=guide`
    })
  } catch (error) {
    console.error('[Template Airtable Setup] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate setup files' },
      { status: 500 }
    )
  }
}
