import { NextResponse } from "next/server";
import { resolveOptionsSource } from "@/services/options/resolveOptionsSource";
import {
  OPTIONS_SOURCE_KEY_REGEX,
  type OptionsSourceErrorCode,
} from "@/services/options/types";
import type { OptionsCredentialDecision } from "@/services/options/credentialPolicy";
import { applyDiagnosticsGate } from "../_shared";

/**
 * POST /api/internal/diagnostics/option-source — live read-only option-source
 * diagnosis (Slice 4.MCP-STAGE-2B-1).
 *
 * Runs the SAME `resolveOptionsSource` service the live builder route runs, under
 * an explicit subject (`userId`), and returns a SANITIZED diagnostic DTO: the
 * real closed `OptionsSourceErrorCode` (or success) plus an item COUNT and a few
 * derived booleans/enums. It deliberately drops the resolver's items, message,
 * and every credential detail.
 *
 * NOT a browser route — no `requireUser()`. The machine bearer
 * (`DIAGNOSTICS_API_TOKEN`) is the trust boundary; the subject is the explicit
 * `userId`. Default OFF (`DIAGNOSTICS_API_ENABLED`), 404 in production unless
 * `DIAGNOSTICS_API_ALLOW_PROD`. See `_shared.ts`.
 *
 * NEVER returned: option item labels/values (e.g. Slack channel names), workflow
 * field values, tokens, encrypted token blobs, scopes, `connectedByUserId`, raw
 * provider response bodies, resolver messages, env values, PII. The DTO below is
 * an allow-list — nothing is spread from the resolver result or the integration
 * row.
 *
 * Read-only and manual: it makes the same single live provider call the builder
 * makes; no retries, no polling, no caching are added here.
 */

interface OptionSourceDiagnosticDTO {
  readonly ok: boolean;
  readonly source: string;
  /** The real closed error code, or null on success. */
  readonly code: OptionsSourceErrorCode | null;
  /** COUNT only — items are never serialized. */
  readonly itemCount: number;
  readonly hasMore: boolean;
  /** Which credential-sharing arm ran (enum), or null when none was consulted. */
  readonly credentialDecision: OptionsCredentialDecision["kind"] | null;
  readonly requiresIntegration: boolean;
  readonly integrationConnected: boolean;
  /** Only present for code === "MISSING_DEPENDENCY". */
  readonly missingDependency?: string;
}

const badInput = (): NextResponse =>
  NextResponse.json({ error: "invalid_input" }, { status: 400 });

function isStringRecord(v: unknown): v is Record<string, string> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (x) => typeof x === "string",
  );
}

export async function POST(request: Request): Promise<Response> {
  const gate = applyDiagnosticsGate(request);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badInput();
  }
  if (typeof body !== "object" || body === null) return badInput();
  const b = body as Record<string, unknown>;

  // `source` — required, must be a well-formed `<provider>:<resource>` key. A
  // well-formed-but-unregistered key is a legitimate diagnosis (SOURCE_NOT_FOUND),
  // so we validate SHAPE here, not registration.
  const source = typeof b.source === "string" ? b.source.trim() : "";
  if (!OPTIONS_SOURCE_KEY_REGEX.test(source)) return badInput();

  // `userId` — required subject. Trusted only because the machine bearer gates
  // the route; the service still applies the credential policy under it.
  const userId = typeof b.userId === "string" ? b.userId.trim() : "";
  if (!userId) return badInput();

  const q = typeof b.q === "string" ? b.q : "";
  const workflowId =
    typeof b.workflowId === "string" && b.workflowId.trim().length > 0
      ? b.workflowId.trim()
      : null;
  const nodeId =
    typeof b.nodeId === "string" && b.nodeId.trim().length > 0
      ? b.nodeId.trim()
      : null;

  let deps: Record<string, string> = {};
  if (b.deps !== undefined) {
    if (!isStringRecord(b.deps)) return badInput();
    deps = b.deps;
  }

  let result: Awaited<ReturnType<typeof resolveOptionsSource>>;
  try {
    result = await resolveOptionsSource({
      source,
      userId,
      q,
      deps,
      workflowId,
      nodeId,
    });
  } catch {
    // resolveOptionsSource already maps known failures to a sanitized code; a
    // throw here is unexpected. Surface a sanitized SERVER_ERROR shape, never
    // the underlying error.
    const dto: OptionSourceDiagnosticDTO = {
      ok: false,
      source,
      code: "SERVER_ERROR",
      itemCount: 0,
      hasMore: false,
      credentialDecision: null,
      requiresIntegration: false,
      integrationConnected: false,
    };
    return NextResponse.json(dto);
  }

  const { response, diagnostics } = result;
  const dto: OptionSourceDiagnosticDTO = response.ok
    ? {
        ok: true,
        source: response.source,
        code: null,
        itemCount: response.items.length, // COUNT only — items dropped
        hasMore: response.hasMore,
        credentialDecision: diagnostics.credentialDecision,
        requiresIntegration: diagnostics.requiresIntegration,
        integrationConnected: diagnostics.integrationConnected,
      }
    : {
        ok: false,
        source: response.source,
        code: response.code,
        itemCount: 0,
        hasMore: false,
        credentialDecision: diagnostics.credentialDecision,
        requiresIntegration: diagnostics.requiresIntegration,
        integrationConnected: diagnostics.integrationConnected,
        ...(response.missingDependency !== undefined && {
          missingDependency: response.missingDependency,
        }),
      };

  return NextResponse.json(dto);
}
