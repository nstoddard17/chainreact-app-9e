import { z } from "zod";

/**
 * Config schema for `motive:send_message` — MOTIVE-1.
 *
 * Sends an in-app message to a driver via `POST /v1/messages`. The driver id
 * arrives as a string from the picker / variable mapping and is coerced to an
 * integer by the handler. `.strict()` — no raw provider wire-format.
 */
export const SendMessageConfigSchema = z
  .object({
    driverId: z.string().min(1),
    message: z.string().min(1).max(2000),
  })
  .strict();

export type SendMessageConfig = z.infer<typeof SendMessageConfigSchema>;
