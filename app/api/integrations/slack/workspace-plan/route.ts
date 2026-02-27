import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server";
import { decrypt } from "@/lib/security/encryption";

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  const { workspaceId } = await request.json();
  logger.debug("[Slack] Workspace plan request", { workspaceId });

  const supabase = await createSupabaseRouteHandlerClient();

  // First, let's check what integrations exist for this workspace
  const { data: allIntegrations, error: allError } = await supabase
    .from("integrations")
    .select("id, provider, team_id, provider_plan, status")
    .eq("provider", "slack");

  // First try to find integration by team_id column
  let { data, error } = await supabase
    .from("integrations")
    .select("provider_plan, team_id, user_id, metadata, access_token")
    .eq("provider", "slack")
    .eq("team_id", workspaceId)
    .single();

  logger.debug("[Slack] Workspace plan query", { hasData: !!data, hasError: !!error });

  // If not found by team_id column, try to find by metadata.team_id (fallback for older integrations)
  if (error || !data) {
    logger.debug("[Slack] Trying metadata.team_id fallback");
    const { data: metadataData, error: metadataError } = await supabase
      .from("integrations")
      .select("provider_plan, team_id, user_id, metadata, access_token")
      .eq("provider", "slack")
      .filter("metadata->>team_id", "eq", workspaceId)
      .single();

    logger.debug("[Slack] Metadata query", { hasData: !!metadataData, hasError: !!metadataError });

    if (metadataError || !metadataData) {
      logger.debug("[Slack] No plan data found, returning free plan");
      return jsonResponse({ plan: "free" }); // fallback
    }

    data = metadataData;
    error = metadataError;

    // Migrate: Update the team_id column for this integration
    if (data && data.metadata?.team_id && !data.team_id) {
      logger.debug("[Slack] Migrating team_id from metadata to column");
      await supabase
        .from("integrations")
        .update({ team_id: data.metadata.team_id })
        .eq("provider", "slack")
        .eq("user_id", data.user_id);
    }
  }

  // If provider_plan is null or undefined, try to fetch it from Slack API
  if (!data.provider_plan) {
    logger.debug("[Slack] Provider plan not set, fetching from Slack API");

    if (!data.access_token) {
      logger.debug("[Slack] No access token found, returning free plan");
      return jsonResponse({ plan: "free" });
    }

    try {
      // Decrypt the access token
      const decryptedToken = decrypt(data.access_token);

      // Fetch plan from Slack API directly
      const response = await fetch("https://slack.com/api/team.info", {
        headers: {
          Authorization: `Bearer ${decryptedToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const slackData = await response.json();

      if (!slackData.ok) {
        logger.debug("[Slack] API returned error, returning free plan");
        return jsonResponse({ plan: "free" });
      }

      const plan = slackData.team?.plan || "free";
      logger.debug("[Slack] Retrieved plan from API", { plan });

      // Update the integration record with the plan
      await supabase
        .from("integrations")
        .update({ provider_plan: plan })
        .eq("provider", "slack")
        .eq("team_id", workspaceId);

      return jsonResponse({ plan });

    } catch (apiError) {
      logger.error("[Slack] Failed to fetch plan from API:", apiError);
      return jsonResponse({ plan: "free" });
    }
  }

  const plan = data.provider_plan || "free";
  logger.debug("[Slack] Returning plan", { plan });
  return jsonResponse({ plan });
}
