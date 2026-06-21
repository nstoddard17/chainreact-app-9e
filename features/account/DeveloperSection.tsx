import { Panel } from "@/features/team/Panel";
import { SettingRow } from "@/features/team/SettingRow";
import { accountTypeLabel } from "@/features/team/accountTypeLabel";
import { McpTokensPanel } from "./McpTokensPanel";
import type { ActiveAccountView } from "./settingsRows";

/**
 * Developer section — MCP tokens (Slice 4.PUBLIC-MCP-10).
 *
 * Settings → Developer → MCP Tokens. Mirrors ApiSection's owner/admin gate: only an
 * owner/admin on a resolved account manages tokens; members see an explainer. Tokens
 * are account-scoped and read-only; the panel makes clear they never expose OAuth /
 * connected-app tokens.
 */
export function DeveloperSection({
  active,
  accountId,
  frozen,
}: {
  active: ActiveAccountView | null;
  /** The active account's id (needed for the management routes). */
  accountId: string | null;
  /** True when the active account is pending deletion (read-only). */
  frozen: boolean;
}) {
  const canManage = active?.role === "owner" || active?.role === "admin";

  return (
    <div data-testid="account-section-developer" className="flex flex-col gap-5">
      <Panel
        title="MCP tokens"
        desc="Connect an MCP-compatible LLM client to this account, read-only."
      >
        {active && (
          <SettingRow
            label="Account"
            desc="Tokens are scoped to this account only. A token works just for this account and does not follow your active-account changes."
          >
            <span className="flex items-center gap-2">
              <span
                data-testid="mcp-account-name"
                className="text-sm font-medium text-foreground"
              >
                {active.name}
              </span>
              <span
                data-testid="mcp-account-type"
                className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
              >
                {accountTypeLabel(active.type)}
              </span>
            </span>
          </SettingRow>
        )}

        <SettingRow label="Tokens" stacked>
          {canManage && accountId ? (
            <McpTokensPanel
              accountId={accountId}
              accountName={active?.name ?? "this account"}
              frozen={frozen}
            />
          ) : (
            <p data-testid="mcp-tokens-member-note" className="max-w-xl text-xs text-muted-foreground">
              {accountId ? (
                <>Owners and admins manage this account&apos;s MCP tokens.</>
              ) : (
                <>MCP tokens are managed per account — there&apos;s no active account to manage.</>
              )}{" "}
              Tokens give read-only access to this account&apos;s workflows, runs, and
              integrations, and{" "}
              <span className="font-medium text-foreground">
                never expose your connected app or OAuth tokens
              </span>
              .
            </p>
          )}
        </SettingRow>
      </Panel>

      <Panel
        title="Connecting a client"
        desc="Point any MCP-compatible client at ChainReact."
      >
        <SettingRow label="Server URL" stacked>
          <div className="flex max-w-xl flex-col gap-1 text-xs text-muted-foreground">
            <code data-testid="mcp-server-url" className="font-mono text-foreground">
              https://mcp.chainreact.app/mcp
            </code>
            <p>
              Use this URL to connect ChainReact to an MCP-compatible LLM client. Add it as
              a custom MCP / streaming-HTTP connector in your client, then authenticate with
              the token you created above. Available tools:{" "}
              <code className="font-mono">list_accounts</code>,{" "}
              <code className="font-mono">list_workflows</code>,{" "}
              <code className="font-mono">get_workflow</code>,{" "}
              <code className="font-mono">list_runs</code>,{" "}
              <code className="font-mono">get_run_details</code>,{" "}
              <code className="font-mono">list_integrations</code>.
            </p>
          </div>
        </SettingRow>
      </Panel>
    </div>
  );
}
