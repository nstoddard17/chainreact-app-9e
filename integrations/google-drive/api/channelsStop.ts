import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Drive `channels.stop`.
 *
 * Tells Google to stop sending notifications for the given channel.
 * Returns 204 No Content on success — the response body is empty.
 *
 * Endpoint: POST {base}/drive/v3/channels/stop
 * Body:     application/json — { id, resourceId }
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 / 410 — the channel was already stopped
 *     or never existed. Callers (deactivate / renew) catch this and treat
 *     as success because the desired state (channel stopped) is achieved.
 *   - generic `Error` on other failures.
 */
export interface ChannelsStopInput {
  accessToken: string;
  channelId: string;
  resourceId: string;
}

interface DriveErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

function surfaceErrorDetail(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as DriveErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON
  }
  return detail;
}

export async function channelsStop(input: ChannelsStopInput): Promise<void> {
  const url = `${driveApiBase()}/drive/v3/channels/stop`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: input.channelId,
      resourceId: input.resourceId,
    }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive channels.stop returned HTTP 401",
    );
  }
  if (res.status === 404 || res.status === 410) {
    const text = await res.text();
    throw new NotFoundError(
      `channel ${input.channelId}`,
      surfaceErrorDetail(text, res.status),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive channels.stop failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  // 204 No Content — nothing to parse.
}
