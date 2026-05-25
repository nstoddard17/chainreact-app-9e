import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `native:http_request`.
 *
 * Mirrors the resolved-config schema in `httpRequest.schema.ts` but
 * expresses UI-only concerns (labels, field types, dependencies). The
 * authoritative validation contract remains the Zod schema; this file
 * is consumed by the discovery registry + builder UI only.
 *
 * Notes on departures from the schema's literal shape:
 *   - `headers` / `queryParams` are `keyvalue` fields here even though
 *     the schema accepts `Array<{key,value}>`. The renderer materializes
 *     keyvalue input into the array shape before save.
 *   - `auth` is presented as a single combobox `authType` for v1. The
 *     conditional auth-field surface (bearer token / basic creds / api key
 *     headers) lands in Slice 3.2's HttpRequestConfig editor — not in
 *     the generic SchemaForm. Keeping the meta narrow here avoids
 *     pretending the SchemaForm can render discriminated unions.
 */
export const httpRequestMeta: ActionMeta = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description:
    "Send an HTTP request to any URL. Supports GET / POST / PUT / PATCH / DELETE, custom headers, query params, and a request body. Timeout 1–30 seconds.",
  category: "http",
  requiresIntegration: false,
  fields: [
    {
      name: "method",
      label: "Method",
      description: "HTTP method. GET / HEAD requests do not send a body.",
      type: "select",
      required: true,
      options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
        { value: "PUT", label: "PUT" },
        { value: "PATCH", label: "PATCH" },
        { value: "DELETE", label: "DELETE" },
      ],
    },
    {
      name: "url",
      label: "URL",
      description: "The full URL to request. Only http:// and https:// schemes are allowed.",
      type: "text",
      required: true,
      placeholder: "https://api.example.com/v1/widgets",
    },
    {
      name: "headers",
      label: "Headers",
      description: "Optional request headers. Up to 50 entries.",
      type: "keyvalue",
      required: false,
      keyValueMaxRows: 50,
    },
    {
      name: "queryParams",
      label: "Query Parameters",
      description: "Optional URL query parameters. Up to 50 entries.",
      type: "keyvalue",
      required: false,
      keyValueMaxRows: 50,
    },
    {
      name: "body",
      label: "Request Body",
      description: "Raw request body. Ignored for GET requests. Up to 1 MiB.",
      type: "textarea",
      required: false,
      placeholder: '{"hello":"world"}',
    },
    {
      name: "timeoutSeconds",
      label: "Timeout (seconds)",
      description: "Request timeout, 1–30 seconds. Defaults to 15.",
      type: "number",
      required: false,
      defaultValue: 15,
      numeric: { min: 1, max: 30, integer: true, step: 1 },
    },
  ],
  outputs: [
    { name: "ok", type: "boolean", description: "True when status is 2xx." },
    { name: "status", type: "number", description: "HTTP status code." },
    { name: "statusText", type: "string" },
    { name: "headers", type: "object", description: "Response headers." },
    { name: "body", type: "string", description: "Response body as text (up to 256 KiB; truncated beyond).", sensitive: true  },
    { name: "bodyJson", type: "unknown", description: "Response body parsed as JSON when content-type is JSON and body is not truncated.", sensitive: true  },
    { name: "bodyTruncated", type: "boolean", description: "True when the response body exceeded the 256 KiB capture cap." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "high",
  riskDescription: "Arbitrary outbound HTTP — can send any upstream value to any URL. Treat as an egress sink.",
};
