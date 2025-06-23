import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET() {
  cookies()
  const supabase = createSupabaseRouteHandlerClient()
  
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if the email_frequency_cache table exists
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'email_frequency_cache')
      .single()

    const tableExists = !tablesError && tables

    let createTableResult = null
    if (!tableExists) {
      console.log("📋 Creating email_frequency_cache table...")
      
      // Create the table using raw SQL
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS email_frequency_cache (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          name TEXT,
          frequency INTEGER NOT NULL DEFAULT 1,
          last_used TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          source TEXT NOT NULL,
          integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_user_id ON email_frequency_cache(user_id);
        CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_email ON email_frequency_cache(email);
        CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_source ON email_frequency_cache(source);
        CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_frequency ON email_frequency_cache(frequency DESC);
        CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_last_used ON email_frequency_cache(last_used DESC);
        
        CREATE UNIQUE INDEX IF NOT EXISTS idx_email_frequency_cache_unique 
        ON email_frequency_cache(user_id, email, source);
        
        ALTER TABLE email_frequency_cache ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY IF NOT EXISTS "Users can access their own email cache" ON email_frequency_cache
          FOR ALL USING (auth.uid() = user_id);
      `
      
      const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL })
      
      if (createError) {
        console.error("Failed to create table:", createError)
        createTableResult = { success: false, error: createError.message }
      } else {
        console.log("✅ Table created successfully")
        createTableResult = { success: true }
      }
    }

    // Test basic operations
    const testResults = {
      tableExists: tableExists || createTableResult?.success,
      createTableResult,
      canInsert: false,
      canSelect: false,
      error: null
    }

    // Test insert
    try {
      const { error: insertError } = await supabase
        .from("email_frequency_cache")
        .insert({
          user_id: session.user.id,
          email: "test@example.com",
          name: "Test User",
          frequency: 1,
          source: "test",
          last_used: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      testResults.canInsert = !insertError
      if (insertError) {
        console.log("Insert test failed:", insertError)
      }
    } catch (error) {
      console.log("Insert test error:", error)
    }

    // Test select
    try {
      const { data, error: selectError } = await supabase
        .from("email_frequency_cache")
        .select("*")
        .eq("user_id", session.user.id)
        .limit(1)

      testResults.canSelect = !selectError
      if (selectError) {
        console.log("Select test failed:", selectError)
      }
    } catch (error) {
      console.log("Select test error:", error)
    }

    // Clean up test data
    try {
      await supabase
        .from("email_frequency_cache")
        .delete()
        .eq("email", "test@example.com")
        .eq("user_id", session.user.id)
    } catch (error) {
      console.log("Cleanup failed:", error)
    }

    return NextResponse.json({
      success: true,
      userId: session.user.id,
      testResults,
      message: "Email cache debug completed"
    })

  } catch (error) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({
      error: "Debug failed",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 