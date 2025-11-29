import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { createClient } from "@supabase/supabase-js";

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const { videoId, integrationId } = await request.json();

    if (!videoId || !integrationId) {
      return errorResponse("Video ID and integration ID are required" , 400);
    }

    // Get the integration to access the access token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    );
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (integrationError || !integration) {
      return errorResponse("Integration not found" , 404);
    }

    // Fetch video details from YouTube API
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${videoId}`,
      {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        return errorResponse("YouTube authentication expired. Please reconnect your account." , 401);
      }
      const errorData = await response.json().catch(() => ({}));
      return jsonResponse(
        { error: `YouTube API error: ${response.status} - ${errorData.error?.message || response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const video = data.items?.[0];

    if (!video) {
      return errorResponse("Video not found" , 404);
    }

    // Extract video details
    const videoDetails = {
      title: video.snippet?.title || "",
      description: video.snippet?.description || "",
      privacyStatus: video.status?.privacyStatus || "private",
      tags: video.snippet?.tags || [],
      publishedAt: video.snippet?.publishedAt,
      thumbnails: video.snippet?.thumbnails,
      categoryId: video.snippet?.categoryId,
      defaultLanguage: video.snippet?.defaultLanguage,
      defaultAudioLanguage: video.snippet?.defaultAudioLanguage,
    };

    return jsonResponse(videoDetails);
  } catch (error: any) {
    logger.error("Error fetching YouTube video details:", error);
    return errorResponse("Failed to fetch video details" , 500);
  }
} 