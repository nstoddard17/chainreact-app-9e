import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server";
import { decrypt } from "@/lib/security/encryption";

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  const { workspaceId } = await request.json();
  logger.debug("🔍 Workspace plan request for workspaceId:", workspaceId);
  
  const supabase = await createSupabaseRouteHandlerClient();

  // First, let's check what integrations exist for this workspace
  const { data: allIntegrations, error: allError } = await supabase
    .from("integrations")
    .select("id, provider, team_id, provider_plan, status")
    .eq("provider", "slack");

  logger.debug("🔍 All Slack integrations:", allIntegrations);
  logger.debug("🔍 All Slack integrations error:", allError);

  // First try to find integration by team_id column
  let { data, error } = await supabase
    .from("integrations")
    .select("provider_plan, team_id, user_id, metadata, access_token")
    .eq("provider", "slack")
    .eq("team_id", workspaceId)
    .single();

  logger.debug("🔍 Workspace plan query result (team_id column):", { data, error, workspaceId });

  // If not found by team_id column, try to find by metadata.team_id (fallback for older integrations)
  if (error || !data) {
    logger.debug("🔍 No data found by team_id column, trying metadata.team_id");
    const { data: metadataData, error: metadataError } = await supabase
      .from("integrations")
      .select("provider_plan, team_id, user_id, metadata, access_token")
      .eq("provider", "slack")
      .filter("metadata->>team_id", "eq", workspaceId)
      .single();

    logger.debug("🔍 Workspace plan query result (metadata):", { data: metadataData, error: metadataError, workspaceId });

    if (metadataError || !metadataData) {
      logger.debug("🔍 No plan data found in either location, returning free plan");
      return jsonResponse({ plan: "free" }); // fallback
    }

    data = metadataData;
    error = metadataError;

    // Migrate: Update the team_id column for this integration
    if (data && data.metadata?.team_id && !data.team_id) {
      logger.debug("🔍 Migrating team_id from metadata to column for integration:", data.user_id);
      await supabase
        .from("integrations")
        .update({ team_id: data.metadata.team_id })
        .eq("provider", "slack")
        .eq("user_id", data.user_id);
    }
  }

  // If provider_plan is null or undefined, try to fetch it from Slack API
  if (!data.provider_plan) {
    logger.debug("🔍 Provider plan not set, attempting to fetch from Slack API");
    
    if (!data.access_token) {
      logger.debug("🔍 No access token found, returning free plan");
      return jsonResponse({ plan: "free" });
    }

    try {
      // Decrypt the access token
      const decryptedToken = decrypt(data.access_token);
      logger.debug("🔍 Successfully decrypted access token");

      // Fetch plan from Slack API directly
      const response = await fetch("https://slack.com/api/team.info", {
        headers: {
          Authorization: `Bearer ${decryptedToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      
      const slackData = await response.json();
      logger.debug("🔍 Slack API response:", slackData);
      
      if (!slackData.ok) {
        logger.debug("🔍 Slack API returned error, returning free plan");
        return jsonResponse({ plan: "free" });
      }

      const plan = slackData.team?.plan || "free";
      logger.debug("🔍 Retrieved plan from Slack API:", plan);

      // Update the integration record with the plan
      await supabase
        .from("integrations")
        .update({ provider_plan: plan })
        .eq("provider", "slack")
        .eq("team_id", workspaceId);

      logger.debug("🔍 Updated integration with plan:", plan);
      return jsonResponse({ plan });
      
    } catch (apiError) {
      logger.error("🔍 Failed to fetch plan from Slack API:", apiError);
      logger.debug("🔍 Falling back to free plan due to API error");
      return jsonResponse({ plan: "free" });
    }
  }

  const plan = data.provider_plan || "free";
  logger.debug("🔍 Returning plan:", plan);
  return jsonResponse({ plan });
} 