import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getDecryptedAccessToken } from "@/lib/workflows/actions/core";

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { documentId, integrationId } = await request.json();

    if (!documentId) {
      return errorResponse("Document ID is required" , 400);
    }

    // Get the user's session
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("Unauthorized" , 401);
    }

    // Get the access token
    let accessToken: string;
    
    if (integrationId) {
      // Use specific integration ID if provided
      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("id", integrationId)
        .eq("user_id", user.id)
        .single();

      if (!integration) {
        return errorResponse("Integration not found" , 404);
      }

      accessToken = await getDecryptedAccessToken(user.id, "google-docs");
    } else {
      // Use default Google Docs integration
      accessToken = await getDecryptedAccessToken(user.id, "google-docs");
    }

    // Fetch document content from Google Docs API
    const response = await fetch(
      `https://docs.googleapis.com/v1/documents/${documentId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      logger.error("Google Docs API error:", errorData);
      return jsonResponse(
        { error: errorData.error?.message || "Failed to fetch document" },
        { status: response.status }
      );
    }

    const document = await response.json();

    // Extract the first 2 paragraphs
    const paragraphs: string[] = [];
    let paragraphCount = 0;
    const maxParagraphs = 2;

    if (document.body?.content) {
      for (const element of document.body.content) {
        if (paragraphCount >= maxParagraphs) break;

        if (element.paragraph?.elements) {
          let paragraphText = "";
          
          for (const textElement of element.paragraph.elements) {
            if (textElement.textRun?.content) {
              paragraphText += textElement.textRun.content;
            }
          }

          // Only add non-empty paragraphs
          const trimmedText = paragraphText.trim();
          if (trimmedText && trimmedText !== "\n") {
            paragraphs.push(trimmedText);
            paragraphCount++;
          }
        }
      }
    }

    // Return the preview data
    return jsonResponse({
      title: document.title || "Untitled Document",
      paragraphs: paragraphs,
    });

  } catch (error: any) {
    logger.error("Error fetching document preview:", error);
    return errorResponse(error.message || "Failed to fetch document preview" , 500);
  }
}