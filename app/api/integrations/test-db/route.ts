import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY

export async function GET(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(
        {
          error: "Missing Supabase environment variables",
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseKey,
        },
        { status: 500 },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    })

    // Test basic connection
    const { data: testData, error: testError } = await supabase.from("integrations").select("count").limit(1)

    if (testError) {
      return jsonResponse(
        {
          error: "Database connection failed",
          details: testError,
        },
        { status: 500 },
      )
    }

    // Test insert capability
    const testIntegration = {
      user_id: "test-user-id",
      provider: "test-provider",
      provider_user_id: "test-provider-user",
      status: "connected",
      access_token: "test-token",
      metadata: { test: true },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data: insertData, error: insertError } = await supabase
      .from("integrations")
      .insert(testIntegration)
      .select()

    if (insertError) {
      return jsonResponse(
        {
          error: "Insert test failed",
          details: insertError,
        },
        { status: 500 },
      )
    }

    // Clean up test data
    if (insertData?.[0]?.id) {
      await supabase.from("integrations").delete().eq("id", insertData[0].id)
    }

    return jsonResponse({
      success: true,
      message: "Database connection and operations working correctly",
      testId: insertData?.[0]?.id,
    })
  } catch (error: any) {
    return jsonResponse(
      {
        error: "Unexpected error",
        message: error.message,
        stack: error.stack,
      },
      { status: 500 },
    )
  }
}
