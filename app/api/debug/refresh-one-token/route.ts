import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const integrationId = searchParams.get("id");
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  // --- 1. Security Check ---
  if (!expectedSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!integrationId) {
    return NextResponse.json({ error: "Missing 'id' query parameter" }, { status: 400 });
  }

  console.log(`[DEBUG] 🚀 Starting forced refresh for integration ID: ${integrationId}`);

  // --- 2. Fetch the Specific Integration ---
  const supabase = createAdminClient();
  if (!supabase) {
    console.error("[DEBUG] ❌ Failed to create Supabase admin client.");
    return NextResponse.json({ error: "Database connection failed" }, { status: 500 });
  }

  const { data: integration, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .single();

  if (error || !integration) {
    console.error(`[DEBUG] ❌ Failed to fetch integration. Error: ${error?.message || "Not found."}`);
    return NextResponse.json({ error: "Failed to fetch integration", details: error?.message }, { status: 404 });
  }

  console.log(`[DEBUG] ✅ Fetched integration for provider: ${integration.provider}`);
  console.log(`[DEBUG] ℹ️ Current Status: ${integration.status}`);
  console.log(`[DEBUG] ℹ️ Current expires_at: ${integration.expires_at}`);

  // --- 3. Run the Refresh Logic ---
  try {
    console.log("[DEBUG] 🔄 Calling refreshTokenIfNeeded...");
    
    // We pass a copy to avoid unintended modifications
    const result = await refreshTokenIfNeeded({ ...integration });

    console.log("[DEBUG] ✅ refreshTokenIfNeeded completed. Result:", result);

    if (result.refreshed) {
      console.log("[DEBUG] ✨ SUCCESS: Token was refreshed. The database *should* have been updated.");
    } else if (result.success) {
      console.log("[DEBUG] ⏩ SKIPPED: The token was not refreshed. Reason:", result.message);
    } else {
      console.error("[DEBUG] 🔥 FAILED: The refresh attempt failed. Reason:", result.message);
    }

    return NextResponse.json({
      message: "Debug refresh process completed. Check Vercel logs for details.",
      integrationId,
      result,
    });
  } catch (e: any) {
    console.error(`[DEBUG] 💥 CRITICAL ERROR during refresh process: ${e.message}`);
    return NextResponse.json({ error: "A critical error occurred", details: e.message }, { status: 500 });
  }
} 