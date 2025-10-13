import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    // Filter by user_id to work with RLS policies
    const { data, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })

    if (error) {
      return errorResponse(error.message , 500)
    }

    return jsonResponse(data)
  } catch (error) {
    return errorResponse("Internal server error" , 500)
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const body = await request.json()
    const { name, description } = body

    const { data, error } = await supabase
      .from("workflows")
      .insert({
        name,
        description,
        user_id: user.id,
        nodes: [],
        connections: [],
        status: "draft",
      })
      .select()
      .single()

    if (error) {
      return errorResponse(error.message , 500)
    }

    return jsonResponse(data)
  } catch (error) {
    return errorResponse("Internal server error" , 500)
  }
}
