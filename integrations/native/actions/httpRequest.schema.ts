import { z } from "zod";

/**
 * Resolved-config schema for the native `http_request` action.
 *
 * Per docs/rules/variable-resolver.md §"Engine pre-resolution (strict)":
 *   - The engine substitutes every `{{...}}` reference in config BEFORE
 *     dispatching the handler. The schema receives concrete strings only.
 *   - The handler also re-parses with this schema for defense-in-depth.
 *
 * Native nodes have no provider OAuth — `auth` here is a per-request HTTP
 * auth scheme (Bearer / Basic / API key) intended for hitting third-party
 * APIs that don't have a dedicated V2 integration. Tokens are supplied by
 * the workflow author via the resolved config; the handler never reads
 * from `core/encryption/tokens` or `repositories/integrations`.
 *
 * Q11 (no hidden defaults): `method` and `url` are both required. No
 * silent fallback to GET; no silent default content-type.
 *
 * Caps locked at plan time
 * (docs/slices/parity/native-nodes-1-tier-a-plan.md §4.2):
 *   - URL ≤ 2048 chars.
 *   - ≤ 50 headers, header value ≤ 8 KiB.
 *   - ≤ 50 query params.
 *   - Body ≤ 1 MiB (1_048_576 bytes UTF-8 string length).
 *   - Timeout 1–30 seconds; default 15 seconds.
 */

export const HttpRequestMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
export type HttpRequestMethod = z.infer<typeof HttpRequestMethodSchema>;

export const HttpRequestHeaderSchema = z
  .object({
    key: z.string().min(1).max(128),
    value: z.string().min(0).max(8192),
  })
  .strict();

export const HttpRequestQueryParamSchema = z
  .object({
    key: z.string().min(1).max(256),
    value: z.string().min(0).max(8192),
  })
  .strict();

export const HttpRequestAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }).strict(),
  z
    .object({
      type: z.literal("bearer"),
      token: z.string().min(1).max(8192),
    })
    .strict(),
  z
    .object({
      type: z.literal("basic"),
      username: z.string().min(1).max(256),
      password: z.string().min(1).max(8192),
    })
    .strict(),
  z
    .object({
      type: z.literal("apiKey"),
      headerName: z.string().min(1).max(128),
      headerValue: z.string().min(1).max(8192),
    })
    .strict(),
]);
export type HttpRequestAuthConfig = z.infer<typeof HttpRequestAuthSchema>;

export const HttpRequestConfigSchema = z
  .object({
    method: HttpRequestMethodSchema,
    url: z.string().min(1).max(2048),
    headers: z.array(HttpRequestHeaderSchema).max(50).optional(),
    queryParams: z.array(HttpRequestQueryParamSchema).max(50).optional(),
    body: z.string().max(1_048_576).optional(),
    auth: HttpRequestAuthSchema.optional(),
    timeoutSeconds: z.number().int().min(1).max(30).default(15),
  })
  .strict();
export type HttpRequestConfig = z.infer<typeof HttpRequestConfigSchema>;
