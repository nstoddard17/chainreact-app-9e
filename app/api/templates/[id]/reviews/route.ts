import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { z } from "zod"

import { logger } from '@/lib/utils/logger'

const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  review_text: z.string().optional(),
})

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const body = await request.json()
    const { rating, review_text } = reviewSchema.parse(body)

    const { data: review, error } = await supabase
      .from("template_reviews")
      .upsert({
        template_id: params.id,
        user_id: user.id,
        rating,
        review_text,
      })
      .select()
      .single()

    if (error) {
      logger.error("Error creating review:", error)
      return errorResponse("Failed to create review" , 500)
    }

    return jsonResponse(review)
  } catch (error) {
    logger.error("Error in POST /api/templates/[id]/reviews:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: reviews, error } = await supabase
      .from("template_reviews")
      .select(`
        *,
        user:auth.users!template_reviews_user_id_fkey(email)
      `)
      .eq("template_id", params.id)
      .order("created_at", { ascending: false })

    if (error) {
      logger.error("Error fetching reviews:", error)
      return errorResponse("Failed to fetch reviews" , 500)
    }

    return jsonResponse(reviews)
  } catch (error) {
    logger.error("Error in GET /api/templates/[id]/reviews:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const { searchParams } = new URL(request.url)
    const reviewId = searchParams.get("reviewId")

    if (!reviewId) {
      return errorResponse("reviewId is required", 400)
    }

    // Users can only delete their own reviews
    const { error } = await supabase
      .from("template_reviews")
      .delete()
      .eq("id", reviewId)
      .eq("user_id", user.id)

    if (error) {
      logger.error("Error deleting review:", error)
      return errorResponse("Failed to delete review", 500)
    }

    return jsonResponse({ message: "Review deleted successfully" })
  } catch (error) {
    logger.error("Error in DELETE /api/templates/[id]/reviews:", error)
    return errorResponse("Internal server error", 500)
  }
}
