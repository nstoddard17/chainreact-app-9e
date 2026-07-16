import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `GET /me/outlook/masterCategories` — the
 * mailbox's master category list.
 *
 * Added for the `microsoft-outlook:categories` options resolver
 * (RESOLVERS-1), which backs the per-chip category picker on
 * `microsoft-outlook:add_categories.categories`.
 *
 * Docs: https://learn.microsoft.com/en-us/graph/api/outlookuser-list-mastercategories
 * Scope: `MailboxSettings.Read` (delegated) — added to the manifest's
 * OPTIONAL scopes in this slice. A token that predates the scope add
 * returns HTTP 403, surfaced as `InsufficientScopeError` so the resolver
 * maps it to a Reconnect prompt (refreshing keeps the same scopes and
 * cannot fix it).
 *
 * PRIVACY: `$select=id,displayName` only — never a message, subject, or
 * address. Single page, `$top`-capped; `@odata.nextLink` is normalized to
 * a boolean-ish `nextLink` so callers can report `hasMore` honestly
 * without ever surfacing the Graph host/URL.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refresh+retry can fix).
 *   - `InsufficientScopeError` on HTTP 403 (missing MailboxSettings.Read —
 *     reconnect needed).
 *   - generic `Error` with a surfaced (token-free) Graph message otherwise.
 */

export interface GraphOutlookCategory {
  id?: string;
  displayName?: string | null;
}

export interface ListMasterCategoriesResult {
  value: GraphOutlookCategory[];
  /** Non-null when Graph returned an `@odata.nextLink` (more pages exist). */
  nextLink: string | null;
}

export interface ListMasterCategoriesInput {
  accessToken: string;
  /** 1..100 page cap (defensively clamped). */
  top?: number;
}

interface GraphMasterCategoriesBody {
  value?: GraphOutlookCategory[];
  "@odata.nextLink"?: string;
}

export async function listMasterCategories(
  input: ListMasterCategoriesInput,
): Promise<ListMasterCategoriesResult> {
  const top = Math.max(1, Math.min(input.top ?? 100, 100));
  const params = new URLSearchParams();
  params.append("$select", "id,displayName");
  params.append("$top", String(top));
  const url = `${graphApiBase()}/v1.0/me/outlook/masterCategories?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph GET me/outlook/masterCategories returned HTTP 401",
    );
  }
  if (res.status === 403) {
    // Missing MailboxSettings.Read (old token predates the manifest add).
    // Do NOT surface Graph's raw body — just a typed reconnect signal.
    throw new InsufficientScopeError(
      "Microsoft Graph GET me/outlook/masterCategories returned HTTP 403 (insufficient scope)",
      "microsoft-outlook",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph GET me/outlook/masterCategories failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as GraphMasterCategoriesBody;
  const rawNext = body["@odata.nextLink"];
  return {
    value: body.value ?? [],
    nextLink: typeof rawNext === "string" && rawNext.length > 0 ? rawNext : null,
  };
}
