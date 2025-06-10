import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getUser } from "@/utils/supabase/server"

export async function POST(request: Request) {
  try {
    const { provider = "test-provider" } = await request.json()

    // Get current user
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Create admin client
    const adminClient = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )

    const testResults = {
      user_id: user.id,
      provider,
      steps: [] as any[],
      success: false,
      error: null as string | null,
    }

    // Step 1: Test basic insert
    try {
      const testData = {
        user_id: user.id,
        provider: `${provider}-${Date.now()}`,
        provider_account_id: "test-account-123",
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        status: "connected",
        metadata: { test: true, timestamp: Date.now() },
      }

      const { data: insertData, error: insertError } = await adminClient.from("integrations").insert(testData).select()

      testResults.steps.push({
        step: "insert",
        success: !insertError,
        error: insertError?.message,
        data: insertData?.[0]?.id,
      })

      if (insertError) {
        testResults.error = `Insert failed: ${insertError.message}`
        return NextResponse.json(testResults)
      }

      const insertedId = insertData?.[0]?.id

      // Step 2: Test select
      const { data: selectData, error: selectError } = await adminClient
        .from("integrations")
        .select("*")
        .eq("id", insertedId)
        .single()

      testResults.steps.push({
        step: "select",
        success: !selectError,
        error: selectError?.message,
        data: selectData ? "Found record" : "No record",
      })

      // Step 3: Test update
      const { data: updateData, error: updateError } = await adminClient
        .from("integrations")
        .update({
          status: "updated",
          metadata: { test: true, updated: true, timestamp: Date.now() },
        })
        .eq("id", insertedId)
        .select()

      testResults.steps.push({
        step: "update",
        success: !updateError,
        error: updateError?.message,
        data: updateData?.[0]?.status,
      })

      // Step 4: Test upsert (should update existing)
      const { data: upsertData, error: upsertError } = await adminClient
        .from("integrations")
        .upsert(
          {
            user_id: user.id,
            provider: testData.provider,
            provider_account_id: "updated-account-123",
            access_token: "updated-access-token",
            status: "upserted",
            metadata: { test: true, upserted: true },
          },
          {
            onConflict: "user_id,provider",
          },
        )
        .select()

      testResults.steps.push({
        step: "upsert",
        success: !upsertError,
        error: upsertError?.message,
        data: upsertData?.[0]?.status,
      })

      // Step 5: Clean up - delete test record
      const { error: deleteError } = await adminClient.from("integrations").delete().eq("id", insertedId)

      testResults.steps.push({
        step: "cleanup",
        success: !deleteError,
        error: deleteError?.message,
        data: "Deleted test record",
      })

      testResults.success = testResults.steps.every((step) => step.success)
    } catch (e: any) {
      testResults.error = `Test exception: ${e.message}`
      testResults.steps.push({
        step: "exception",
        success: false,
        error: e.message,
        data: null,
      })
    }

    return NextResponse.json(testResults)
  } catch (error: any) {
    return NextResponse.json(
      {
        error: `Test failed: ${error.message}`,
        success: false,
      },
      { status: 500 },
    )
  }
}
