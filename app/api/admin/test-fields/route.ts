/**
 * Test Fields API
 *
 * Returns the required fields for testing a specific action/trigger
 * Used when dynamic field loading fails and manual input is needed
 */

import { type NextRequest, NextResponse } from 'next/server'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const nodeType = searchParams.get('nodeType')

    if (!nodeType) {
      return NextResponse.json(
        { error: 'nodeType parameter is required' },
        { status: 400 }
      )
    }

    // Get the node definition
    const nodeDefinition = ALL_NODE_COMPONENTS.find(n => n.type === nodeType)
    if (!nodeDefinition) {
      return NextResponse.json(
        { error: `Node type not found: ${nodeType}` },
        { status: 404 }
      )
    }

    // Extract required fields
    const requiredFields = nodeDefinition.configSchema
      ?.filter(field => field.required)
      .map(field => ({
        name: field.name,
        label: field.label || field.name,
        type: field.type,
        placeholder: field.placeholder,
        tooltip: field.tooltip,
        options: field.options,
        dynamic: field.dynamic,
      })) || []

    return NextResponse.json({
      nodeType,
      nodeName: nodeDefinition.name,
      requiredFields,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
