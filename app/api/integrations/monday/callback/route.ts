import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBaseUrl } from "@/lib/utils/getBaseUrl";
import { createPopupResponse } from "@/lib/utils/createPopupResponse";
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils";
import { logger } from "@/lib/utils/logger";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase URL or service role key");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = getBaseUrl();

  if (error) {
    logger.error(`Monday.com OAuth error: ${error} - ${errorDescription}`);
    return createPopupResponse(
      "error",
      "monday",
      errorDescription || "An unknown error occurred.",
      baseUrl
    );
  }

  if (!code) {
    logger.error("Missing code in Monday.com callback");
    return createPopupResponse(
      "error",
      "monday",
      "Authorization code is missing.",
      baseUrl
    );
  }

  if (!state) {
    logger.error("Missing state in Monday.com callback");
    return createPopupResponse(
      "error",
      "monday",
      "State parameter is missing.",
      baseUrl
    );
  }

  try {
    const clientId = process.env.MONDAY_CLIENT_ID;
    const clientSecret = process.env.MONDAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Monday.com client ID or secret not configured");
    }

    const stateData = JSON.parse(atob(state));
    const { userId } = stateData;

    if (!userId) {
      logger.error("Missing userId in Monday.com state");
      return createPopupResponse(
        "error",
        "monday",
        "User ID is missing from state",
        baseUrl
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://auth.monday.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseUrl}/api/integrations/monday/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      throw new Error(
        `Monday.com token exchange failed: ${errorData.error_description || errorData.error}`
      );
    }

    const tokenData = await tokenResponse.json();
    const scopes = tokenData.scope ? tokenData.scope.split(" ") : [];

    // Get user info from Monday.com
    const userResponse = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "query { me { id name email } }",
      }),
    });

    if (!userResponse.ok) {
      throw new Error("Failed to get Monday.com user info");
    }

    const userData = await userResponse.json();
    const user = userData.data?.me;

    if (!user) {
      throw new Error("User data not found in Monday.com response");
    }

    const integrationData = await prepareIntegrationData(
      userId,
      "monday",
      tokenData.access_token,
      tokenData.refresh_token,
      scopes,
      tokenData.expires_in,
      {
        provider_user_id: user.id,
        provider_user_email: user.email,
      }
    );

    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert(integrationData, {
        onConflict: "user_id, provider",
      });

    if (upsertError) {
      throw new Error(
        `Failed to save Monday.com integration: ${upsertError.message}`
      );
    }

    logger.info("Monday.com integration saved successfully", { userId, providerId: user.id });

    return createPopupResponse(
      "success",
      "monday",
      "Monday.com account connected successfully.",
      baseUrl
    );
  } catch (e: any) {
    logger.error("Monday.com callback error:", e);
    return createPopupResponse(
      "error",
      "monday",
      e.message || "An unexpected error occurred.",
      baseUrl
    );
  }
}
