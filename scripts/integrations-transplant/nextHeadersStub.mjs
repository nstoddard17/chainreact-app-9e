/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — `next/headers` stub for the CLI.
 *
 * The canonical repositories (`repositories/accounts.ts` et al.) import the
 * Next.js SSR-cookie Supabase client at module scope, which needs
 * `next/headers` — unavailable outside a Next request. The transplant CLI
 * uses ONLY the service-role functions of those repositories, so the session
 * client is never invoked.
 *
 * These stubs THROW rather than returning empty values: if any code path ever
 * did reach the session client from this CLI, it must fail loudly, never
 * silently operate with an empty/absent auth context.
 */
function unavailable(api) {
  return () => {
    throw new Error(
      `next/headers.${api}() is unavailable in the integrations-transplant CLI: ` +
        `this utility uses service-role repository functions only. Reaching the ` +
        `session client here is a bug — failing closed.`,
    );
  };
}

export const cookies = unavailable("cookies");
export const headers = unavailable("headers");
export const draftMode = unavailable("draftMode");
