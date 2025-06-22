import { NextResponse } from "next/server"
import { TokenRefreshService } from "@/lib/integrations/tokenRefreshService"
import { NextRequest } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * @swagger
 * /api/cron/refresh-tokens-simple:
 *   get:
 *     summary: Refreshes expiring OAuth tokens for all integrations.
 *     description: |
 *       This endpoint queries all integrations, identifies tokens that are expiring soon, and refreshes them.
 *       - By default, processes all integrations with no limit.
 *       - Access tokens expiring in the next 30 minutes are refreshed.
 *       - Refresh tokens expiring in the next 30 minutes are refreshed.
 *       - The `cleanupMode=true` parameter can be used to run a less frequent, deeper check (e.g., once a day)
 *         for tokens with longer expiration windows (30 days for refresh tokens).
 *     parameters:
 *       - name: cleanupMode
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *         description: If true, uses a 30-day look-behind for refresh tokens and 48 hours for access tokens.
 *       - name: provider
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: If provided, only refreshes tokens for the specified provider.
 *       - name: includeInactive
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *         description: If true, also attempts to refresh tokens for inactive integrations.
 *     responses:
 *       200:
 *         description: Token refresh process completed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 total_integrations_to_process:
 *                   type: integer
 *                 success_count:
 *                   type: integer
 *                 failure_count:
 *                   type: integer
 *                 duration_seconds:
 *                    type: number
 *                 details:
 *                    type: array
 *                    items:
 *                      type: string
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cleanupMode = searchParams.get('cleanupMode') === 'true';
    const provider = searchParams.get('provider') || undefined;
    const includeInactive = searchParams.get('includeInactive') === 'true';

    // Determine thresholds based on cleanup mode
    const accessTokenExpiryThreshold = cleanupMode ? 2880 : 30; // 48 hours for cleanup, 30 mins otherwise
    const refreshTokenExpiryThreshold = cleanupMode ? 43200 : 30; // 30 days for cleanup, 30 mins otherwise

    // Run token refresh using our service
    const stats = await TokenRefreshService.refreshTokens({
      prioritizeExpiring: true,
      onlyProvider: provider,
      includeInactive,
      accessTokenExpiryThreshold,
      refreshTokenExpiryThreshold,
    });
    
    // Log the outcome
    const duration = (stats.durationMs ?? 0) / 1000;
    const responseMessage = `Token refresh finished in ${duration.toFixed(2)}s. ${stats.successful} succeeded, ${stats.failed} failed.`;
    
    console.log(responseMessage, {
      total_processed: stats.processed,
      successful: stats.successful,
      failed: stats.failed,
      skipped: stats.skipped,
      provider_stats: stats.providerStats
    });

    return NextResponse.json({ 
      message: responseMessage,
      duration_seconds: duration,
      stats: {
        processed: stats.processed,
        successful: stats.successful,
        failed: stats.failed,
        skipped: stats.skipped,
      },
      errors: stats.errors,
      provider_stats: stats.providerStats,
     });
  } catch (e) {
    const error = e as Error;
    console.error(`Token refresh cron job failed: ${error.message}`, { error });
    return NextResponse.json({ message: "Token refresh failed", error: error.message }, { status: 500 });
  }
}
