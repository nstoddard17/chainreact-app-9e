import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { messageSend } from "@/integrations/_shared/motive/api/messages";
import { resolveCompany } from "./_resolveCompany";
import { toMotiveId } from "./_ids";
import { SendMessageConfigSchema } from "./sendMessage.schema";

/**
 * Motive `send_message` action handler — MOTIVE-1.
 *
 * `POST /v1/messages` via the typed wrapper under `refreshAndRetry`. The driver
 * id is a numeric FK in the message BODY, so it is coerced via `toMotiveId`.
 * Output is a bounded send receipt — never the raw record.
 */
export const sendMessage: ActionHandler = async (input) => {
  const config = SendMessageConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  const sent = await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      messageSend({
        accessToken,
        driverId: toMotiveId(config.driverId, "driver id"),
        message: config.message,
      }),
  });

  return { output: { messageId: sent.messageId, createdAt: sent.createdAt } };
};
