import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Create conditional supabase client
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
        },
      })
    : null

export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json(
      {
        error: "Supabase not configured",
        message: "Missing required Supabase environment variables",
      },
      { status: 503 },
    )
  }

  return NextResponse.json({ message: "Hello from debug!" })
}
