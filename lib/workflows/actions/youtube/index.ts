import { google } from 'googleapis'
import { ActionResult } from '../index'

/**
 * Download image from URL and convert to buffer
 */
async function downloadImageFromUrl(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error: any) {
    throw new Error(`Failed to download image from URL: ${error.message}`)
  }
}

/**
 * Upload video to YouTube
 */
export async function uploadYouTubeVideo(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const {
      videoFile,
      title,
      description = "",
      tags = [],
      category,
      privacyStatus = "private",
      publishAt,
      thumbnailMode,
      thumbnailFile,
      thumbnailUrl,
      playlists = [],
      license = "youtube",
      madeForKids = false,
      ageRestriction = "none",
      locationLatitude,
      locationLongitude,
      locationName,
      recordingDate,
      notifySubscribers = true,
      allowComments = true,
      allowRatings = true,
      allowEmbedding = true
    } = config

    // Validate required fields
    if (!videoFile || !title) {
      throw new Error("Video file and title are required")
    }

    // Initialize YouTube API client
    const youtube = google.youtube({
      version: 'v3',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    // Prepare video metadata
    const videoMetadata: any = {
      snippet: {
        title,
        description,
        tags: Array.isArray(tags) ? tags : tags.split(',').map((tag: string) => tag.trim()),
        categoryId: category,
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en'
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: madeForKids,
        notifySubscribers
      }
    }

    // Add publish date if specified
    if (publishAt) {
      videoMetadata.status.publishAt = new Date(publishAt).toISOString()
    }

    // Add location if specified
    if (locationLatitude && locationLongitude) {
      videoMetadata.recordingDetails = {
        location: {
          latitude: parseFloat(locationLatitude),
          longitude: parseFloat(locationLongitude),
          description: locationName
        }
      }
    }

    // Add recording date if specified
    if (recordingDate) {
      if (!videoMetadata.recordingDetails) {
        videoMetadata.recordingDetails = {}
      }
      videoMetadata.recordingDetails.recordingDate = new Date(recordingDate).toISOString()
    }

    // Add content details
    videoMetadata.contentDetails = {
      licensedContent: license === 'creativeCommon',
      projection: 'rectangular'
    }

    // Add statistics
    videoMetadata.statistics = {
      commentCount: allowComments ? undefined : 0,
      likeCount: allowRatings ? undefined : 0
    }

    // Add access control
    videoMetadata.accessControl = {
      comment: {
        access: allowComments ? 'allowed' : 'denied'
      },
      commentVote: {
        access: allowComments ? 'allowed' : 'denied'
      },
      videoRespond: {
        access: allowComments ? 'allowed' : 'denied'
      },
      rate: {
        access: allowRatings ? 'allowed' : 'denied'
      },
      embed: {
        access: allowEmbedding ? 'allowed' : 'denied'
      }
    }

    // Add age restriction if specified
    if (ageRestriction === '18+') {
      videoMetadata.contentDetails.contentRating = {
        acbRating: '18+',
        agcomRating: '18+',
        anatelRating: '18+',
        bbfcRating: '18+',
        bfvcRating: '18+',
        bmukkRating: '18+',
        catvRating: '18+',
        catvfrRating: '18+',
        cbfcRating: '18+',
        cccRating: '18+',
        cceRating: '18+',
        chfilmRating: '18+',
        chvrsRating: '18+',
        cicfRating: '18+',
        cnaRating: '18+',
        cncRating: '18+',
        csaRating: '18+',
        cscfRating: '18+',
        czfilmRating: '18+',
        djctqRating: '18+',
        djctqRatingReasons: ['violence'],
        ecbmctRating: '18+',
        eefilmRating: '18+',
        egfilmRating: '18+',
        eirinRating: '18+',
        fcbmRating: '18+',
        fcoRating: '18+',
        fmocRating: '18+',
        fpbRating: '18+',
        fpbRatingReasons: ['violence'],
        fskRating: '18+',
        grfilmRating: '18+',
        icaaRating: '18+',
        ifcoRating: '18+',
        ilfilmRating: '18+',
        incaaRating: '18+',
        kfcbRating: '18+',
        kijkwijzerRating: '18+',
        kmrbRating: '18+',
        lsfRating: '18+',
        mccaaRating: '18+',
        mccypRating: '18+',
        mcstRating: '18+',
        mdaRating: '18+',
        medietilsynetRating: '18+',
        mekuRating: '18+',
        menaMpaaRating: '18+',
        mibacRating: '18+',
        mocRating: '18+',
        moctwRating: '18+',
        mpaaRating: '18+',
        mpaatRating: '18+',
        mtrcbRating: '18+',
        nbcRating: '18+',
        nbcplRating: '18+',
        nfrcRating: '18+',
        nfvcbRating: '18+',
        nkclvRating: '18+',
        oflcRating: '18+',
        pefilmRating: '18+',
        rcnofRating: '18+',
        resorteviolenciaRating: '18+',
        rtcRating: '18+',
        rteRating: '18+',
        russiaRating: '18+',
        skfilmRating: '18+',
        smaisRating: '18+',
        smsaRating: '18+',
        tvpgRating: '18+',
        ytRating: 'yt_age_restricted'
      }
    }

    // Upload video file
    console.log('Starting video upload to YouTube...')
    
    // Convert video file to readable stream
    let videoStream: any
    if (videoFile instanceof File || videoFile instanceof Blob) {
      videoStream = videoFile.stream()
    } else if (videoFile.buffer) {
      videoStream = require('stream').Readable.from(videoFile.buffer)
    } else {
      throw new Error('Invalid video file format')
    }

    const uploadResponse = await youtube.videos.insert({
      part: ['snippet', 'status', 'contentDetails', 'recordingDetails', 'statistics', 'accessControl'],
      requestBody: videoMetadata,
      media: {
        body: videoStream
      }
    })

    if (!uploadResponse.data.id) {
      throw new Error('Failed to upload video: No video ID returned')
    }

    const videoId = uploadResponse.data.id
    console.log(`Video uploaded successfully with ID: ${videoId}`)

    // Handle thumbnail upload if specified
    if (thumbnailMode === 'upload' && thumbnailFile) {
      console.log('Uploading custom thumbnail...')
      
      let thumbnailBuffer: Buffer
      if (thumbnailFile instanceof File || thumbnailFile instanceof Blob) {
        const arrayBuffer = await thumbnailFile.arrayBuffer()
        thumbnailBuffer = Buffer.from(arrayBuffer)
      } else if (thumbnailFile.buffer) {
        thumbnailBuffer = thumbnailFile.buffer
      } else {
        throw new Error('Invalid thumbnail file format')
      }

      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          body: require('stream').Readable.from(thumbnailBuffer)
        }
      })
      
      console.log('Custom thumbnail uploaded successfully')
    } else if (thumbnailMode === 'url' && thumbnailUrl) {
      console.log('Downloading and uploading thumbnail from URL...')
      
      try {
        const thumbnailBuffer = await downloadImageFromUrl(thumbnailUrl)
        
        await youtube.thumbnails.set({
          videoId: videoId,
          media: {
            body: require('stream').Readable.from(thumbnailBuffer)
          }
        })
        
        console.log('Thumbnail from URL uploaded successfully')
      } catch (error: any) {
        console.warn(`Failed to upload thumbnail from URL: ${error.message}`)
        // Continue without thumbnail - video upload was successful
      }
    }

    // Add video to playlists if specified
    if (playlists.length > 0) {
      console.log('Adding video to playlists...')
      
      for (const playlistId of playlists) {
        try {
          await youtube.playlistItems.insert({
            part: ['snippet'],
            requestBody: {
              snippet: {
                playlistId: playlistId,
                resourceId: {
                  kind: 'youtube#video',
                  videoId: videoId
                }
              }
            }
          })
        } catch (error: any) {
          console.warn(`Failed to add video to playlist ${playlistId}: ${error.message}`)
        }
      }
    }

    return {
      success: true,
      output: {
        videoId: videoId,
        title: title,
        description: description,
        privacyStatus: privacyStatus,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      },
      message: `Video "${title}" uploaded successfully to YouTube`
    }

  } catch (error: any) {
    console.error("YouTube upload video error:", error)
    return { 
      success: false, 
      error: error.message || "Failed to upload video to YouTube" 
    }
  }
}

/**
 * List all YouTube videos for the user, with automatic pagination and field mask support
 */
export async function listYouTubeVideos(accessToken: string, config: any, input: any): Promise<ActionResult> {
  try {
    const { 
      fieldsToReturn = [],
      channelId,
      playlistId,
      searchQuery,
      orderBy = "date",
      publishedAfter,
      publishedBefore,
      videoDefinition = "any",
      videoDuration = "any",
      regionCode,
      videoCategoryId
    } = config

    // Build the fields param
    let fieldsParam = fieldsToReturn && Array.isArray(fieldsToReturn) && fieldsToReturn.length > 0
      ? fieldsToReturn.join(",")
      : "items(snippet(title,description,publishedAt,thumbnails(default(url)))),items(statistics(viewCount,likeCount,commentCount))"

    // Always include kind and etag for root
    if (!fieldsParam.includes("kind")) {
      fieldsParam = "kind,etag," + fieldsParam
    }

    const youtube = google.youtube({
      version: 'v3',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    // 1. Get the user's channelId if not specified
    let targetChannelId = channelId
    if (!targetChannelId) {
      const channelResp = await youtube.channels.list({
        part: ['id'],
        mine: true
      })
      targetChannelId = channelResp.data.items?.[0]?.id
      if (!targetChannelId) throw new Error('Could not determine YouTube channel ID for user.')
    }

    // 2. Use search.list to get all video IDs (paginated)
    let videoIds: string[] = []
    let nextPageToken: string | undefined = undefined
    
    // Build search parameters
    const searchParams: any = {
      part: ['id'],
      type: ['video'],
      maxResults: 50,
      order: orderBy,
      pageToken: nextPageToken
    }
    
    // Add filters based on configuration
    if (searchQuery) {
      searchParams.q = searchQuery
    } else if (playlistId) {
      // If playlist is specified, we'll need to get videos from playlist instead
      searchParams.playlistId = playlistId
    } else {
      searchParams.channelId = targetChannelId
    }
    
    if (publishedAfter) {
      searchParams.publishedAfter = new Date(publishedAfter).toISOString()
    }
    
    if (publishedBefore) {
      searchParams.publishedBefore = new Date(publishedBefore).toISOString()
    }
    
    if (videoDefinition !== "any") {
      searchParams.videoDefinition = videoDefinition
    }
    
    if (videoDuration !== "any") {
      searchParams.videoDuration = videoDuration
    }
    
    if (regionCode) {
      searchParams.regionCode = regionCode
    }
    
    if (videoCategoryId) {
      searchParams.videoCategoryId = videoCategoryId
    }
    
    do {
      const searchResp = await youtube.search.list(searchParams) as any
      const ids = (searchResp.data.items || [])
        .map((item: any) => item.id?.videoId)
        .filter((id: string | undefined) => !!id)
      videoIds.push(...ids)
      nextPageToken = searchResp.data.nextPageToken
      searchParams.pageToken = nextPageToken
    } while (nextPageToken)

    // 3. Use videos.list in batches of 50
    let allVideos: any[] = []
    for (let i = 0; i < videoIds.length; i += 50) {
      const batchIds = videoIds.slice(i, i + 50)
      if (batchIds.length === 0) continue
      const videosResp = await youtube.videos.list({
        part: [
          'id', 'snippet', 'statistics', 'contentDetails', 'status'
        ],
        id: batchIds,
        fields: fieldsParam
      }) as any // Explicitly type as any for now
      if (videosResp.data.items) {
        allVideos.push(...videosResp.data.items)
      }
    }

    return {
      success: true,
      output: {
        videos: allVideos
      },
      message: `Fetched ${allVideos.length} videos from YouTube.`
    }
  } catch (error: any) {
    console.error("YouTube list videos error:", error)
    return {
      success: false,
      error: error.message || "Failed to list YouTube videos"
    }
  }
}