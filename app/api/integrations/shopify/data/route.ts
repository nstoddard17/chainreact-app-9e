import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const dataType = searchParams.get("dataType")

    // Since Shopify integration is coming soon, return empty data
    // In the future, this would fetch actual data from Shopify API
    switch (dataType) {
      case "stores":
        return jsonResponse({
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
        return jsonResponse({
          data: [],
          message: "Shopify integration is coming soon"
        })
      
      default:
        return jsonResponse({
          data: [],
          message: "Shopify integration is coming soon"
        })
    }
  } catch (error: any) {
    logger.error("Error fetching Shopify data:", error)
    return errorResponse("Failed to fetch Shopify data", 500, { details: error.message  })
  }
}