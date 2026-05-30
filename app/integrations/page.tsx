import { redirect, type RedirectType } from "next/navigation";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Legacy `/integrations` route → permanent redirect to `/apps`
 * (Slice 4.APPS-PAGE-1).
 *
 * The product surface moved to `/apps`. We preserve query parameters so
 * post-OAuth callback toasts (`?integration=connected&provider=…`,
 * `?integration_error=…`) keep working for any deep links / bookmarks /
 * notification CTAs that still point at the legacy URL.
 *
 * `/api/integrations/oauth/*` is unchanged — the API namespace stays
 * "integrations" since it matches the database table + provider folder
 * names; only the product page noun changes to "Apps".
 */
function serializeSearch(
  params: Record<string, string | string[] | undefined>,
): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      out.append(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) if (v) out.append(key, v);
    }
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

export default async function LegacyIntegrationsPage({ searchParams }: Props) {
  const params = await searchParams;
  // `replace` (not `push`) so the legacy URL is gone from history — the
  // canonical surface is /apps and we don't want users navigating Back into
  // a redirect loop.
  redirect(`/apps${serializeSearch(params)}`, "replace" as RedirectType);
}
