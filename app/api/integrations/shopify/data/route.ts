import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const dataType = searchParams.get("dataType")

    // Since Shopify integration is coming soon, return empty data
    // In the future, this would fetch actual data from Shopify API
    switch (dataType) {
      case "stores":
        return NextResponse.json({
          data: [
            {
              id: "coming-soon",
              name: "Shopify Integration Coming Soon",
              value: "coming-soon"
            }
          ]
        })
      
      case "products":
      case "collections":
      case "customers":
        return NextResponse.json({
          data: [],
          message: "Shopify integration is coming soon"
        })
      
      default:
        return NextResponse.json({
          data: [],
          message: "Shopify integration is coming soon"
        })
    }
  } catch (error: any) {
    console.error("Error fetching Shopify data:", error)
    return NextResponse.json(
      { error: "Failed to fetch Shopify data", details: error.message },
      { status: 500 }
    )
  }
}