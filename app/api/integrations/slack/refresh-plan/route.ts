import { NextRequest, NextResponse } from "next/server";
import { updateSlackProviderPlan } from "@/lib/integrations/slack";
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  const { userId, workspaceId } = await request.json();
  if (!userId || !workspaceId) {
    return NextResponse.json({ error: "Missing userId or workspaceId" }, { status: 400 });
  }

  await updateSlackProviderPlan(userId, workspaceId);

  // Fetch the updated plan from the DB
  const supabase = await createSupabaseRouteHandlerClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("provider_plan")
    .eq("provider", "slack")
    .eq("team_id", workspaceId)
    .single();

  if (error || !data) {
    return NextResponse.json({ plan: "free" });
  }

  return NextResponse.json({ plan: data.provider_plan || "free" });
} 