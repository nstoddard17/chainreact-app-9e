import { z } from "zod";

/**
 * The mobile error envelope and code vocabulary.
 *
 * Mirrors the web cookie surface's `{ error, code?, details? }` convention and
 * the lifecycle code map (see `lib/api/workflows.ts` `WorkflowApiErrorCode` in
 * ChainReactV2 — a parity test in the web repo pins this list as a superset of
 * that union, minus the client-local `UNKNOWN`). `error` is a human-readable
 * sentence already safe to display; `code` is the stable token clients branch
 * on. Servers never put raw provider text, stack traces, or database errors in
 * either field — that guarantee lives server-side and is test-pinned there.
 */
export const MOBILE_ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "NOT_ACCOUNT_MEMBER",
  "ACCOUNT_PENDING_DELETION",
  "WORKFLOW_NOT_FOUND",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "LIFECYCLE_CONFLICT",
  "MISSING_PRECONDITIONS",
  "TRIGGER_REGISTRATION_FAILED",
  "CONFIRMATION_REQUIRED",
  "WORKFLOW_USES_PRIVATE_CREDENTIAL",
  "ACCOUNT_FROZEN",
  "PLAN_FEATURE_REQUIRED",
  "RATE_LIMITED",
  "UNSUPPORTED_CLIENT_VERSION",
  "SERVER_ERROR",
] as const;

export const MobileErrorCodeSchema = z.enum(MOBILE_ERROR_CODES);
export type MobileErrorCode = z.infer<typeof MobileErrorCodeSchema>;

/**
 * Every non-2xx `/api/mobile/v1` response body parses with this. `details` is
 * deliberately opaque here; known structured details (confirmation-required)
 * have their own schema below and are parsed on demand after branching on
 * `code`.
 */
export const MobileErrorEnvelopeSchema = z.object({
  error: z.string(),
  code: MobileErrorCodeSchema.optional(),
  details: z.unknown().optional(),
});
export type MobileErrorEnvelope = z.infer<typeof MobileErrorEnvelopeSchema>;

/**
 * One action node that flipped a workflow into confirmation-required mode.
 * Mirrors the server's route-safe `ConfirmationRequiredAction` — no config,
 * no resolved values, no ids beyond provider/type/displayName + an optional
 * risk description. `.strict()`: the confirm sheet renders exactly this.
 */
export const MobileConfirmationRequiredActionSchema = z
  .object({
    nodeId: z.string(),
    provider: z.string(),
    type: z.string(),
    displayName: z.string(),
    riskDescription: z.string().optional(),
  })
  .strict();
export type MobileConfirmationRequiredAction = z.infer<
  typeof MobileConfirmationRequiredActionSchema
>;

/**
 * The 409 CONFIRMATION_REQUIRED body from activate / run-now.
 * `confirmationText` is server-driven — clients MUST echo it verbatim and
 * never hardcode the phrase.
 */
export const MobileConfirmationRequiredDetailSchema = z
  .object({
    requiresConfirmation: z.literal(true),
    confirmationText: z.string().min(1),
    actions: z.array(MobileConfirmationRequiredActionSchema),
  })
  .strict();
export type MobileConfirmationRequiredDetail = z.infer<
  typeof MobileConfirmationRequiredDetailSchema
>;
