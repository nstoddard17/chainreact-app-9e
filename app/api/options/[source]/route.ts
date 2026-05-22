import { NextResponse } from "next/server";
import { requireUser } from "@/app/api/providers/_shared";
import { getActiveForExecution } from "@/repositories/integrations";
import { getOptionsResolver } from "@/services/options/_registry";
import {
  OptionsResolverError,
  type OptionsSourceErrorCode,
  type OptionsSourceResponse,
} from "@/services/options/types";

/**
 * GET /api/options/[source] — async options-source endpoint.
 *
 * Slice 3.30 foundation. Plan reference:
 * docs/slices/phase-3/options-source-plan.md §4.
 *
 * Stable discriminated body:
 *   { ok: true,  source, items, hasMore }
 *   { ok: false, source, code, message, missingDependency? }
 *
 * Status codes:
 *   - 401 for `UNAUTHENTICATED` (matches `requireUser()` contract).
 *   - 200 for every other code — the body's `ok: false` + `code` is
 *     the load-bearing signal. The client uses `code` to branch, not
 *     status; this matches the discovery API convention (a missing
 *     provider returns 404 there, but here the analog is "source
 *     unknown" which deserves a typed body to drive picker UX rather
 *     than swallowing a 404).
 *
 * Query string:
 *   - `q` — trimmed search query (max 256 chars; clamped). Empty
 *     string when absent.
 *   - `deps[<parentField>]` — dependsOn parent values. Multiple
 *     parents supported (e.g. `?deps[baseId]=foo&deps[tableId]=bar`).
 *     Empty / whitespace-only values count as missing.
 *
 * Security:
 *   - No token leakage in `message`. No raw provider response bodies.
 *     Resolvers throw `OptionsResolverError` with caller-friendly
 *     sanitized strings.
 *   - `requireUser()` short-circuits on no session.
 *   - When `resolver.requiresIntegration === true`, the user's active
 *     integration is looked up via the service-role-backed
 *     `getActiveForExecution(userId, provider, null)`. Missing /
 *     disconnected → `INTEGRATION_DISCONNECTED`.
 *
 * The route deliberately does NOT cache. Each request fans out to the
 * resolver. v1 scope.
 */

const MAX_QUERY_LENGTH = 256;

interface ErrorBody {
  source: string;
  code: OptionsSourceErrorCode;
  message: string;
  missingDependency?: string;
}

function errorResponse(body: ErrorBody, status = 200): Response {
  const payload: OptionsSourceResponse = {
    ok: false,
    source: body.source,
    code: body.code,
    message: body.message,
    ...(body.missingDependency !== undefined && {
      missingDependency: body.missingDependency,
    }),
  };
  return NextResponse.json(payload, { status });
}

/**
 * Extract `deps[<parent>]` query params into a record. Empty /
 * whitespace-only values are dropped so the resolver's
 * `requiredDeps` check sees them as missing. Multiple values for the
 * same parent are not supported in v1 (the route uses the first
 * occurrence the `URLSearchParams` iterator returns, which mirrors
 * Express / Next default behavior).
 */
function extractDeps(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    const match = key.match(/^deps\[([^\]]+)\]$/);
    if (!match) continue;
    const parent = match[1]!;
    if (out[parent] !== undefined) continue; // first occurrence wins
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    out[parent] = trimmed;
  }
  return out;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { source: rawSource } = await params;
  // Next.js URL-decodes the `[source]` segment, so `slack%3Achannels`
  // arrives as `slack:channels`. No additional decode pass needed.
  const source = rawSource;

  const resolver = getOptionsResolver(source);
  if (!resolver) {
    return errorResponse({
      source,
      code: "SOURCE_NOT_FOUND",
      message: `Unknown options source '${source}'.`,
    });
  }

  // Parse query string.
  const url = new URL(request.url);
  const rawQ = url.searchParams.get("q") ?? "";
  const q = rawQ.trim().slice(0, MAX_QUERY_LENGTH);
  const deps = extractDeps(url.searchParams);

  // Required-deps check happens BEFORE integration lookup so a missing
  // parent never costs an integration DB query.
  if (resolver.requiredDeps) {
    for (const required of resolver.requiredDeps) {
      if (deps[required] === undefined) {
        return errorResponse({
          source,
          code: "MISSING_DEPENDENCY",
          message: `Required dependsOn field '${required}' is missing.`,
          missingDependency: required,
        });
      }
    }
  }

  // Integration lookup (only when the resolver declares it required).
  let integration = null;
  if (resolver.requiresIntegration) {
    try {
      integration = await getActiveForExecution(
        auth.userId,
        resolver.provider,
        null,
      );
    } catch {
      // Repository-layer failure (e.g. service-role client error).
      // Sanitized — never echo the underlying message.
      return errorResponse({
        source,
        code: "SERVER_ERROR",
        message: "Couldn't look up integration. Try again.",
      });
    }
    if (integration === null) {
      return errorResponse({
        source,
        code: "INTEGRATION_DISCONNECTED",
        message: `No active ${resolver.provider} integration. Connect ${resolver.provider} first.`,
      });
    }
  }

  // Resolver dispatch.
  try {
    const result = await resolver.resolve({
      userId: auth.userId,
      integration,
      q,
      deps,
    });
    const payload: OptionsSourceResponse = {
      ok: true,
      source,
      items: result.items,
      hasMore: result.hasMore,
    };
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof OptionsResolverError) {
      return errorResponse({
        source,
        code: err.code,
        message: err.message,
      });
    }
    // Uncaught — sanitize and downgrade to SERVER_ERROR.
    return errorResponse({
      source,
      code: "SERVER_ERROR",
      message: "Couldn't load options. Try again.",
    });
  }
}
