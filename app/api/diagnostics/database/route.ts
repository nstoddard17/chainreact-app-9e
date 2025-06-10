import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  try {
    // Check environment variables
    const envCheck = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    }

    // Initialize results
    const results = {
      envCheck,
      connection: false,
      tables: {} as Record<string, boolean>,
      schema: {} as Record<string, any>,
      error: null as string | null,
      integrationTest: null as any,
    }

    // Check if we have the minimum required env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({
        ...results,
        error: "Missing required Supabase environment variables",
      })
    }

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )

    // Test connection
    const { data: connectionTest, error: connectionError } = await supabase
      .from("_prisma_migrations")
      .select("*")
      .limit(1)

    if (connectionError && connectionError.code === "PGRST116") {
      // This is actually good - it means we connected but the table doesn't exist
      results.connection = true
    } else if (connectionError) {
      results.connection = false
      results.error = `Connection error: ${connectionError.message}`
      return NextResponse.json(results)
    } else {
      results.connection = true
    }

    // Check for required tables
    const requiredTables = ["integrations", "users", "workflows", "templates"]

    for (const table of requiredTables) {
      try {
        const { error } = await supabase.from(table).select("count").limit(0)
        results.tables[table] = !error
      } catch (e) {
        results.tables[table] = false
      }
    }

    // Check integrations table schema
    try {
      const { data: columns, error } = await supabase.rpc("get_table_columns", { table_name: "integrations" })

      if (!error && columns) {
        results.schema.integrations = columns
      } else {
        // Fallback method if RPC is not available
        const { data: sample, error: sampleError } = await supabase.from("integrations").select("*").limit(1)

        if (!sampleError && sample && sample.length > 0) {
          results.schema.integrations = Object.keys(sample[0]).map((column) => ({
            column_name: column,
            data_type: typeof sample[0][column],
          }))
        }
      }
    } catch (e) {
      results.schema.integrations = null
    }

    // Test integration insertion
    try {
      const testId = `test-${Date.now()}`
      const testData = {
        id: testId,
        user_id: "00000000-0000-0000-0000-000000000000", // Dummy user ID
        provider: "test-provider",
        provider_account_id: "test-account",
        access_token: "test-token",
        status: "test",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {},
      }

      const { data: insertResult, error: insertError } = await supabase.from("integrations").insert(testData).select()

      // Clean up test data
      await supabase.from("integrations").delete().eq("id", testId)

      results.integrationTest = {
        success: !insertError,
        error: insertError ? insertError.message : null,
        details: insertResult,
      }
    } catch (e: any) {
      results.integrationTest = {
        success: false,
        error: e.message,
        details: null,
      }
    }

    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({
      connection: false,
      tables: {},
      schema: {},
      error: `Unexpected error: ${error.message}`,
      integrationTest: null,
    })
  }
}
