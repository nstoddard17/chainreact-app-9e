import { motiveRequest } from "./_request";

/**
 * Typed Message API wrapper — MOTIVE-1.
 *
 * `POST /v1/messages` sends an in-app message to a driver
 * (docs/providers/motive/research.md §5, scope `messages.manage`). Bounded
 * output — never the raw record.
 */

interface MessageEnvelope {
  message?: { id?: number | string; created_at?: string | null };
}

export interface SentMotiveMessage {
  messageId: string | null;
  createdAt: string | null;
}

export async function messageSend(input: {
  accessToken: string;
  driverId: number | string;
  message: string;
}): Promise<SentMotiveMessage> {
  const res = await motiveRequest<MessageEnvelope>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/messages",
    data: {
      message: {
        driver_id: input.driverId,
        message: input.message,
      },
    },
    resourceForNotFound: "message send endpoint",
  });
  return {
    messageId: res.message?.id != null ? String(res.message.id) : null,
    createdAt:
      typeof res.message?.created_at === "string" ? res.message.created_at : null,
  };
}
