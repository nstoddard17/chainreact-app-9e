import { type NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/utils/getBaseUrl";
import { logger } from "@/lib/utils/logger";

/**
 * Monday.com OAuth Initiation
 * Redirects user to Monday.com authorization page
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    logger.error("Missing userId in Monday.com OAuth request");
    return NextResponse.json(
      { error: "User ID is required" },
      { status: 400 }
    );
  }

  const clientId = process.env.MONDAY_CLIENT_ID;
  if (!clientId) {
    logger.error("Monday.com client ID not configured");
    return NextResponse.json(
      { error: "Monday.com integration not configured" },
      { status: 500 }
    );
  }

  const baseUrl = getBaseUrl();
  const redirectUri = `${baseUrl}/api/integrations/monday/callback`;

  // Create state parameter with userId
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64");

  // Build authorization URL
  const authUrl = new URL("https://auth.monday.com/oauth2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  logger.info("Redirecting to Monday.com OAuth", { userId });

  return NextResponse.redirect(authUrl.toString());
}
