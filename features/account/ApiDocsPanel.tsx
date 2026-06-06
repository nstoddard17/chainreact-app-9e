import type { ReactNode } from "react";
import { LAUNCH_API_KEY_SCOPE } from "@/lib/api/accounts";

/**
 * Developer reference for the public API-key workflow trigger
 * (Slice 4.API-KEYS-DOCS-1). Pure, static, presentational — no backend, no fetch,
 * no per-key generated URLs. It documents the EXISTING FK-4 endpoint + RATE-LIMIT-1
 * limiter + RH-3 run-history label; it adds no API behavior.
 *
 * Honesty rules: the endpoint path uses a literal `{workflowId}` placeholder (never
 * a fabricated id/URL); the bearer + curl examples use a `crk_live_...` placeholder
 * (never a real or invented key/hash); and the flag note makes clear that the public
 * API only works once an admin enables `ENABLE_PUBLIC_API_KEYS` (default off).
 */

const ENDPOINT = "POST /api/v1/workflows/{workflowId}/trigger";

const CURL_EXAMPLE = `curl -X POST \\
  https://<your-domain>/api/v1/workflows/{workflowId}/trigger \\
  -H "Authorization: Bearer crk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"inputs": {}}'`;

const SUCCESS_EXAMPLE = `202 Accepted
{ "ok": true, "runId": "<uuid>", "enqueuedAt": "<iso-8601>" }`;

const ERROR_ROWS: ReadonlyArray<{ status: string; meaning: string }> = [
  { status: "401", meaning: "Missing or invalid API key." },
  { status: "403", meaning: "Key lacks the workflows:trigger scope, or the account is frozen." },
  {
    status: "404",
    meaning:
      "Public API disabled (server flag off), or the workflow doesn’t exist / isn’t owned by the key’s account.",
  },
  { status: "409", meaning: "Workflow is not in a triggerable state." },
  { status: "422", meaning: "Workflow has no manual trigger node." },
  { status: "429", meaning: "Rate limit exceeded — includes a Retry-After header." },
];

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-[11px] text-foreground">
      {children}
    </code>
  );
}

function Block({ testId, children }: { testId: string; children: string }) {
  return (
    <pre
      data-testid={testId}
      className="overflow-x-auto rounded-md border border-border bg-background/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
    >
      {children}
    </pre>
  );
}

export function ApiDocsPanel() {
  return (
    <div data-testid="api-docs-panel" className="flex flex-col gap-4 text-xs text-muted-foreground">
      <p>
        Trigger a workflow programmatically with an account-scoped API key. Create a key
        above (owner/admin only) — the full secret is{" "}
        <span data-testid="api-docs-reveal" className="font-medium text-foreground">
          shown only once at creation
        </span>
        , so copy it then; you won’t be able to see it again.
      </p>

      <div>
        <div className="mb-1 font-medium text-foreground">Scope</div>
        <p>
          The only supported scope today is <Mono>{LAUNCH_API_KEY_SCOPE}</Mono> — trigger a
          workflow run.
        </p>
      </div>

      <div>
        <div className="mb-1 font-medium text-foreground">Endpoint</div>
        <Block testId="api-docs-endpoint">{ENDPOINT}</Block>
        <p className="mt-1" data-testid="api-docs-auth">
          Authenticate with the bearer header{" "}
          <Mono>Authorization: Bearer crk_live_...</Mono> — no cookie/session is used.
          Accepts a JSON body up to 256 KiB; the body is passed through as the manual
          trigger input (<Mono>{`{"inputs": { ... }}`}</Mono>).
        </p>
      </div>

      <div>
        <div className="mb-1 font-medium text-foreground">Example request</div>
        <Block testId="api-docs-curl">{CURL_EXAMPLE}</Block>
      </div>

      <div>
        <div className="mb-1 font-medium text-foreground">Success</div>
        <Block testId="api-docs-response">{SUCCESS_EXAMPLE}</Block>
      </div>

      <div>
        <div className="mb-1 font-medium text-foreground">Errors</div>
        <table data-testid="api-docs-errors" className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-[11px] text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Status</th>
              <th className="py-1 font-medium">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {ERROR_ROWS.map((row) => (
              <tr key={row.status} className="border-b border-border/60 last:border-b-0">
                <td className="py-1 pr-3 align-top">
                  <Mono>{row.status}</Mono>
                </td>
                <td className="py-1 align-top">{row.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="mb-1 font-medium text-foreground">Rate limits</div>
        <p data-testid="api-docs-ratelimit">
          Requests are rate limited per key (60/min), per workflow (30/min), and per
          account (300/min). When a limit is exceeded the endpoint returns{" "}
          <Mono>429</Mono> with a <Mono>Retry-After</Mono> header (seconds to wait before
          retrying).
        </p>
      </div>

      <div>
        <div className="mb-1 font-medium text-foreground">Run history</div>
        <p data-testid="api-docs-runlabel">
          Runs started this way appear in run history labeled{" "}
          <span className="font-medium text-foreground">Triggered via API key</span> (with
          the key’s non-secret prefix), so they’re distinguishable from manual runs.
        </p>
      </div>

      <p
        data-testid="api-docs-security"
        className="rounded-md border border-border bg-background/40 p-2"
      >
        <span className="font-medium text-foreground">Security:</span> keys act as your
        account to trigger workflows. They{" "}
        <span className="font-medium text-foreground">
          never expose your connected app or OAuth tokens
        </span>
        , and ChainReact stores only a one-way hash + a display prefix — never the raw key.
      </p>

      <p
        data-testid="api-docs-flag"
        className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2"
      >
        The public API is controlled by the server setting{" "}
        <Mono>ENABLE_PUBLIC_API_KEYS</Mono> (default off). If trigger requests return{" "}
        <Mono>404</Mono>, an admin still needs to enable it for your deployment.
      </p>
    </div>
  );
}
