import { NextResponse } from "next/server"
import { predefinedTemplates, getTemplatesByCategory, searchTemplates } from "@/lib/templates/predefinedTemplates"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const search = searchParams.get("search")
    
    let templates = predefinedTemplates
    
    // Filter by category if provided
    if (category && category !== "all") {
      templates = getTemplatesByCategory(category)
    }
    
    // Filter by search query if provided
    if (search) {
      templates = searchTemplates(search)
    }
    
    // Transform templates to match the expected format
    const formattedTemplates = templates.map(template => ({
      ...template,
      created_at: new Date().toISOString(),
      creator: {
        email: "templates@chainreact.com"
      },
      is_predefined: true
    }))
    
    return NextResponse.json({
      templates: formattedTemplates,
      count: formattedTemplates.length
    })
  } catch (error) {
    console.error("Error fetching predefined templates:", error)
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    )
  }
}