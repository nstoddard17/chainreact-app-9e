import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUser } from "@/utils/supabase/server"

export async function GET() {
  try {
    // Environment check
    const envVars = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
    }

    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: envVars,
      database: {
        connection: false,
        tables: {},
        schema: null,
        permissions: {},
        sampleData: null,
      },
      auth: {
        user: null,
        session: null,
      },
      integrations: {
        count: 0,
        samples: [],
        errors: [],
      },
      recommendations: [],
    }

    // Check if we have required environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      diagnostics.recommendations.push("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
      return NextResponse.json(diagnostics)
    }

    // Create admin client
    const adminClient = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )

    // Test database connection
    try {
      const { data, error } = await adminClient.from("integrations").select("count").limit(0)
      diagnostics.database.connection = !error
      if (error) {
        diagnostics.integrations.errors.push(`Connection error: ${error.message}`)
      }
    } catch (e: any) {
      diagnostics.integrations.errors.push(`Connection exception: ${e.message}`)
    }

    // Check table existence and structure
    const tables = ["integrations", "user_profiles", "workflows"]
    for (const table of tables) {
      try {
        const { error } = await adminClient.from(table).select("*").limit(0)
        diagnostics.database.tables[table] = !error
        if (error) {
          diagnostics.integrations.errors.push(`Table ${table}: ${error.message}`)
        }
      } catch (e: any) {
        diagnostics.database.tables[table] = false
        diagnostics.integrations.errors.push(`Table ${table} exception: ${e.message}`)
      }
    }

    // Get integrations table schema
    try {
      const { data: schemaData, error: schemaError } = await adminClient
        .from("information_schema.columns")
        .select("column_name, data_type, is_nullable, column_default")
        .eq("table_name", "integrations")
        .eq("table_schema", "public")

      if (!schemaError && schemaData) {
        diagnostics.database.schema = schemaData
      }
    } catch (e: any) {
      diagnostics.integrations.errors.push(`Schema query failed: ${e.message}`)
    }

    // Check current user authentication
    try {
      const user = await getUser()
      diagnostics.auth.user = user ? { id: user.id, email: user.email } : null
    } catch (e: any) {
      diagnostics.integrations.errors.push(`Auth check failed: ${e.message}`)
    }

    // Test integration operations if we have a connection
    if (diagnostics.database.connection && diagnostics.database.tables.integrations) {
      try {
        // Count existing integrations
        const { count, error: countError } = await adminClient
          .from("integrations")
          .select("*", { count: "exact", head: true })

        if (!countError) {
          diagnostics.integrations.count = count || 0
        }

        // Get sample integrations
        const { data: samples, error: samplesError } = await adminClient.from("integrations").select("*").limit(3)

        if (!samplesError && samples) {
          diagnostics.integrations.samples = samples.map((sample) => ({
            id: sample.id,
            provider: sample.provider,
            user_id: sample.user_id,
            status: sample.status,
            created_at: sample.created_at,
            has_access_token: !!sample.access_token,
            has_refresh_token: !!sample.refresh_token,
          }))
        }

        // Test insert/delete operation
        const testId = `test-${Date.now()}`
        const testData = {
          id: testId,
          user_id: "00000000-0000-0000-0000-000000000000",
          provider: "test-diagnostic",
          provider_account_id: "test-account",
          access_token: "test-token",
          status: "test",
          metadata: { test: true },
        }

        const { data: insertData, error: insertError } = await adminClient
          .from("integrations")
          .insert(testData)
          .select()

        if (insertError) {
          diagnostics.integrations.errors.push(`Insert test failed: ${insertError.message}`)
          diagnostics.recommendations.push("Check database permissions and constraints")
        } else {
          // Clean up test data
          await adminClient.from("integrations").delete().eq("id", testId)
          diagnostics.recommendations.push("Database operations working correctly")
        }
      } catch (e: any) {
        diagnostics.integrations.errors.push(`Integration operations test failed: ${e.message}`)
      }
    }

    // Check RLS policies
    try {
      const { data: policies, error: policiesError } = await adminClient
        .from("pg_policies")
        .select("*")
        .eq("tablename", "integrations")

      if (!policiesError && policies) {
        diagnostics.database.permissions = {
          rls_enabled: policies.length > 0,
          policies: policies.map((p) => ({
            name: p.policyname,
            cmd: p.cmd,
            permissive: p.permissive,
          })),
        }
      }
    } catch (e: any) {
      diagnostics.integrations.errors.push(`RLS check failed: ${e.message}`)
    }

    // Generate recommendations
    if (!diagnostics.database.connection) {
      diagnostics.recommendations.push("Fix database connection - check Supabase URL and keys")
    }

    if (!diagnostics.database.tables.integrations) {
      diagnostics.recommendations.push("Create integrations table using the provided schema")
    }

    if (diagnostics.integrations.errors.length > 0) {
      diagnostics.recommendations.push("Review error messages for specific issues")
    }

    if (diagnostics.integrations.count === 0) {
      diagnostics.recommendations.push("No integrations found - test creating a new integration")
    }

    return NextResponse.json(diagnostics)
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Diagnostic failed: ${error.message}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
