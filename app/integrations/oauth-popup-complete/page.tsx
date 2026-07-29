import { sanitizeOAuthPopupCompleteParams } from "@/core/integrations/oauthPopupBridge";
import { OAuthPopupComplete } from "@/features/integrations/OAuthPopupComplete";

/**
 * OAuth popup completion page (REACT-AGENT-GUIDED-BUILD-1).
 *
 * The FIXED internal page a popup-launched connect flow lands on after the
 * OAuth callback (or a token/credential ingest) finishes. It renders a short
 * status note and hands the SANITIZED result to the client component, which
 * posts ONE same-origin message to `window.opener` and closes the window.
 *
 * SERVER component: it only sanitizes search params through the shared bridge
 * contract. Anything malformed collapses to null → a generic note, no message
 * posted. The params carry NO secrets by construction: provider slug, a
 * connected/error status, a stable redacted error code, and the attempt nonce
 * (client-generated randomness, not a credential).
 */

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function asString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function OAuthPopupCompletePage({ searchParams }: PageProps) {
  const search = await searchParams;
  const result = sanitizeOAuthPopupCompleteParams({
    provider: asString(search.provider),
    status: asString(search.status),
    nonce: asString(search.nonce),
    code: asString(search.code),
  });

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <OAuthPopupComplete result={result} />
    </main>
  );
}
