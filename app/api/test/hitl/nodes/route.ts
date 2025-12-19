import { NextResponse } from "next/server"
import { getCondensedNodesCatalog, getAvailableNodesCatalog } from "@/lib/workflows/actions/hitl/nodeContext"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"

/**
 * GET /api/test/hitl/nodes
 * Debug endpoint to check what node catalog is being generated
 */
export async function GET() {
  try {
    // Get raw counts
    const totalNodes = ALL_NODE_COMPONENTS.length

    const availableNodes = ALL_NODE_COMPONENTS.filter(node =>
      !node.hideInActionSelection &&
      !node.deprecated &&
      !node.comingSoon &&
      !node.isSystemNode
    )

    // Group by category
    const byCategory: Record<string, number> = {}
    for (const node of availableNodes) {
      const cat = node.category || 'Other'
      byCategory[cat] = (byCategory[cat] || 0) + 1
    }

    // Get AI nodes specifically
    const aiNodes = availableNodes.filter(n => n.category === 'AI').map(n => ({
      type: n.type,
      title: n.title
    }))

    // Get condensed catalog
    const condensedCatalog = getCondensedNodesCatalog()

    return NextResponse.json({
      totalNodes,
      availableNodes: availableNodes.length,
      byCategory,
      aiNodes,
      condensedCatalogPreview: condensedCatalog.substring(0, 2000),
      condensedCatalogLength: condensedCatalog.length
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 })
  }
}
