import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
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
      console.error("Error creating review:", error)
      return NextResponse.json({ error: "Failed to create review" }, { status: 500 })
    }

    return NextResponse.json(review)
  } catch (error) {
    console.error("Error in POST /api/templates/[id]/reviews:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
      console.error("Error fetching reviews:", error)
      return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
    }

    return NextResponse.json(reviews)
  } catch (error) {
    console.error("Error in GET /api/templates/[id]/reviews:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
