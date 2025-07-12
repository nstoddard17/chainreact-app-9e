import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { videoId, integrationId } = await request.json();

    if (!videoId || !integrationId) {
      return NextResponse.json(
        { error: "Video ID and integration ID are required" },
        { status: 400 }
      );
    }

    // Get the integration to access the access token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .single();

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
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
        return NextResponse.json(
          { error: "YouTube authentication expired. Please reconnect your account." },
          { status: 401 }
        );
      }
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: `YouTube API error: ${response.status} - ${errorData.error?.message || response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const video = data.items?.[0];

    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
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

    return NextResponse.json(videoDetails);
  } catch (error: any) {
    console.error("Error fetching YouTube video details:", error);
    return NextResponse.json(
      { error: "Failed to fetch video details" },
      { status: 500 }
    );
  }
} 