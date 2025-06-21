import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"
import { SupabaseClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const maxDuration = 300; // Allow up to 5 minutes for the job to complete

interface RefreshStats {
  total_processed: number
  successful_refreshes: number
  failed_refreshes: number
  skipped_refreshes: number
  error_count: number
  attempts: number
  errors: Array<{
    provider: string
    user_id: string
    error: string
  }>
}

// This cron job runs every 20 minutes
export async function GET(request: NextRequest) {
  const jobId = `refresh-job-${Date.now()}`
  const startTime = Date.now()
  const supabase = createAdminClient()

  try {
    // AUTHENTICATION
    const authHeader = request.headers.get("authorization")
    const querySecret = new URL(request.url).searchParams.get("cron_secret")
    const expectedSecret = process.env.CRON_SECRET
    if (!expectedSecret || (authHeader?.replace("Bearer ", "") || querySecret) !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // JOB START LOG
    await logJobStart(supabase, jobId)

    // FETCH INTEGRATIONS
    const integrations = await getIntegrationsToRefresh(supabase, jobId)
    if (!integrations || integrations.length === 0) {
      return await completeJob(supabase, jobId, startTime, {
        total_processed: 0,
        successful_refreshes: 0,
        failed_refreshes: 0,
        skipped_refreshes: 0,
        error_count: 0,
        attempts: 0,
        errors: [],
      })
    }

    // PROCESS INTEGRATIONS
    const stats = await processIntegrations(integrations, supabase, jobId)

    // JOB COMPLETION LOG
    return await completeJob(supabase, jobId, startTime, stats)
  } catch (error: any) {
    console.error(`💥 [${jobId}] Critical job failure:`, error)
    await logCriticalFailure(supabase, jobId, startTime, error.message)
    return NextResponse.json(
      { success: false, error: "Critical job failure", details: error.message },
      { status: 500 },
    )
  }
}

async function logJobStart(supabase: SupabaseClient, jobId: string) {
  await supabase.from("token_refresh_logs").insert({
    job_id: jobId,
    status: "started",
    created_at: new Date().toISOString(),
    executed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
}

async function getIntegrationsToRefresh(supabase: SupabaseClient, jobId: string) {
  console.log(`🔍 [${jobId}] Fetching integrations...`)
  const now = new Date()
  const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000).toISOString()
  
  // Query for integrations that:
  // 1. Are already expired (expires_at < now)
  // 2. Expire within 30 minutes (expires_at < now + 30mins)
  // 3. Have a status of 'expired' or 'needs_reauthorization'
  // 4. Have a refresh token available
  console.log(`[${jobId}] Finding tokens expiring before ${thirtyMinsFromNow} (within 30 minutes)`)
  
  const { data: integrationsToRefresh, error } = await supabase
    .from("integrations")
    .select("*")
    .or(`expires_at.lt.${thirtyMinsFromNow},status.eq.expired,status.eq.needs_reauthorization`)
    .not("refresh_token", "is", null)
    .order("expires_at", { ascending: true }) // Process most urgent expirations first
    .limit(100) // Process up to 100 integrations per run
  
  if (error) {
    console.error(`❌ [${jobId}] Error fetching integrations:`, error)
    throw new Error(`Error fetching integrations: ${error.message}`)
  }
  
  // Classify integrations for logging purposes
  const expired = integrationsToRefresh?.filter(i => 
    i.expires_at && new Date(i.expires_at) < now).length || 0;
    
  const expiringSoon = integrationsToRefresh?.filter(i => 
    i.expires_at && new Date(i.expires_at) >= now && new Date(i.expires_at) <= new Date(thirtyMinsFromNow)).length || 0;
    
  const statusExpired = integrationsToRefresh?.filter(i => 
    i.status === "expired" || i.status === "needs_reauthorization").length || 0;
  
  console.log(`✅ [${jobId}] Found ${integrationsToRefresh?.length || 0} integrations to process:`);
  console.log(`   - ${expired} already expired`);
  console.log(`   - ${expiringSoon} expiring within 30 minutes`);
  console.log(`   - ${statusExpired} marked as expired/needs_reauthorization`);
  
  return integrationsToRefresh;
}

async function processIntegrations(
  integrations: any[],
  supabase: SupabaseClient,
  jobId: string,
): Promise<RefreshStats> {
  const stats: RefreshStats = {
    total_processed: 0,
    successful_refreshes: 0,
    failed_refreshes: 0,
    skipped_refreshes: 0,
    error_count: 0,
    attempts: 0,
    errors: [],
  }

  const MAX_RETRIES = 3;
  
  // Process integrations sequentially to avoid race conditions and rate limits
  for (const integration of integrations) {
    stats.total_processed++
    let success = false;
    
    // Track if this was an expired token we're trying to recover
    const wasExpired = integration.status === "expired" || 
                      integration.status === "needs_reauthorization" ||
                      (integration.expires_at && new Date(integration.expires_at) <= new Date());
    
    // Log start of processing for this integration
    console.log(`🔄 [${jobId}] Processing ${integration.provider} for user ${integration.user_id} (${wasExpired ? 'EXPIRED' : 'ACTIVE'})`);
    
    // Try up to MAX_RETRIES times
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      stats.attempts++;
      
      try {
        console.log(`[${jobId}] Attempt ${attempt}/${MAX_RETRIES} for ${integration.provider}`);
        
        // Create attempt log entry if the table exists
        try {
          await supabase.from("token_refresh_attempts").insert({
            integration_id: integration.id,
            job_id: jobId,
            attempt_number: attempt,
            status: "started",
            provider: integration.provider
          });
        } catch (e) {
          // If the table doesn't exist, just continue
          console.log(`[${jobId}] Note: token_refresh_attempts table might not exist`);
        }
        
        const result = await refreshTokenIfNeeded(integration);
        
        // Update attempt status if the table exists
        try {
          await supabase.from("token_refresh_attempts")
            .update({
              status: result.success ? "success" : "failed",
              message: result.message,
              refreshed: result.refreshed,
            })
            .match({ 
              integration_id: integration.id, 
              job_id: jobId,
              attempt_number: attempt 
            });
        } catch (e) {
          // If the table doesn't exist, just continue
        }

        if (result.refreshed) {
          // Success! We refreshed the token
          success = true;
          stats.successful_refreshes++;
          
          if (wasExpired) {
            console.log(`✅ [${jobId}] Successfully recovered expired ${integration.provider} token on attempt ${attempt}`);
          } else {
            console.log(`✅ [${jobId}] Successfully refreshed ${integration.provider} token on attempt ${attempt}`);
          }
          
          // Ensure status is set to connected
          await supabase
            .from("integrations")
            .update({
              status: "connected",
              updated_at: new Date().toISOString()
            })
            .eq("id", integration.id);
            
          // Success - no need to retry
          break;
        } else if (result.success) {
          // Token didn't need refresh but operation was successful
          success = true;
          stats.skipped_refreshes++;
          console.log(`➖ [${jobId}] Skipped ${integration.provider}: ${result.message}`);
          
          // No need to retry
          break;
        } else {
          // Failed to refresh token
          console.warn(`⚠️ [${jobId}] Failed to refresh ${integration.provider} token on attempt ${attempt}: ${result.message}`);
          
          // Only retry if we haven't reached MAX_RETRIES
          if (attempt < MAX_RETRIES) {
            console.log(`[${jobId}] Will retry ${integration.provider} (${attempt}/${MAX_RETRIES})`);
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
          }
        }
      } catch (error: any) {
        // Update attempt status if table exists
        try {
          await supabase.from("token_refresh_attempts")
            .update({
              status: "error",
              message: error.message
            })
            .match({ 
              integration_id: integration.id, 
              job_id: jobId,
              attempt_number: attempt 
            });
        } catch (e) {
          // If the table doesn't exist, just continue
        }
          
        console.error(`❌ [${jobId}] Error on attempt ${attempt}/${MAX_RETRIES} for ${integration.provider}:`, error);
        
        // Only retry if we haven't reached MAX_RETRIES
        if (attempt < MAX_RETRIES) {
          console.log(`[${jobId}] Will retry after error (${attempt}/${MAX_RETRIES})`);
          // Wait a bit before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }
    
    // After all retries, if still not successful, count as failed
    if (!success) {
      stats.failed_refreshes++;
      stats.error_count++;
      stats.errors.push({
        provider: integration.provider,
        user_id: integration.user_id,
        error: `Failed after ${MAX_RETRIES} attempts`
      });
      console.error(`❌ [${jobId}] Failed to refresh ${integration.provider} after ${MAX_RETRIES} attempts`);
      
      // Update integration with failure count
      const updateData: {
        consecutive_failures: number;
        last_failure_at: string;
        updated_at: string;
        status?: string;
      } = {
        consecutive_failures: (integration.consecutive_failures || 0) + 1,
        last_failure_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      // Check if the token has actually expired based on its expires_at timestamp
      const now = new Date();
      if (integration.expires_at && new Date(integration.expires_at) <= now) {
        // Token is actually expired, update status to "expired"
        console.log(`[${jobId}] Setting ${integration.provider} status to 'expired' since refresh failed and token has expired (${integration.expires_at})`);
        updateData.status = "expired";
      } else if (integration.expires_at) {
        // Token is still valid, keep status as "connected"
        const expiresAt = new Date(integration.expires_at);
        const timeUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000; // in seconds
        console.log(`[${jobId}] Keeping ${integration.provider} status as 'connected' since token is still valid for ${timeUntilExpiry.toFixed(0)} seconds`);
        
        // Only set status if it's not already connected
        if (integration.status !== "connected") {
          updateData.status = "connected";
        }
      }
      
      await supabase
        .from("integrations")
        .update(updateData)
        .eq("id", integration.id);
    }
  }
  
  return stats;
}

async function completeJob(supabase: SupabaseClient, jobId: string, startTime: number, stats: RefreshStats) {
  const durationMs = Date.now() - startTime
  await supabase
    .from("token_refresh_logs")
    .update({
      status: "completed",
      duration_ms: durationMs,
      executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_processed: stats.total_processed,
      successful_refreshes: stats.successful_refreshes,
      failed_refreshes: stats.failed_refreshes,
      skipped_refreshes: stats.skipped_refreshes,
      error_count: stats.error_count,
      errors: stats.errors.length > 0 ? stats.errors : null,
    })
    .eq("job_id", jobId)

  console.log(`🏁 [${jobId}] Job completed in ${durationMs}ms.`)
  console.log(`📊 [${jobId}] Stats: Processed ${stats.total_processed}, Success ${stats.successful_refreshes}, Failed ${stats.failed_refreshes}, Skipped ${stats.skipped_refreshes}, Error count: ${stats.error_count}, Total attempts: ${stats.attempts}`)
  
  return NextResponse.json({ 
    success: true, 
    jobId, 
    duration_ms: durationMs,
    stats: {
      total_processed: stats.total_processed,
      successful_refreshes: stats.successful_refreshes,
      failed_refreshes: stats.failed_refreshes,
      skipped_refreshes: stats.skipped_refreshes,
      error_count: stats.error_count,
      attempts: stats.attempts
    }
  })
}

async function logCriticalFailure(supabase: SupabaseClient, jobId: string, startTime: number, errorMessage: string) {
  const durationMs = Date.now() - startTime
  await supabase
    .from("token_refresh_logs")
    .update({
      status: "failed",
      is_critical_failure: true,
      duration_ms: durationMs,
      executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_count: 1,
      errors: [{ error: "Critical job failure", message: errorMessage }],
    })
    .eq("job_id", jobId)
}
