# Linear — Owner Setup (CS-1 MCP-AUTH)

**Status:** connect-flow only (no actions/triggers yet). Provider ships
`isExperimental: true` — hidden from the default Apps catalog until CS-6 live
certification. Slice plan:
[`mcp-integration-layer-architecture-plan.md`](../../slices/phase-5/mcp-integration-layer-architecture-plan.md).

## 1. Create the Linear OAuth application (one-time, per environment)

1. In the Linear workspace ChainReact will own the app from, open
   **Settings → API → OAuth applications** (`linear.app/settings/api/applications`)
   and create a new application.
2. **Callback URL** (exact match required):
   - Production: `https://chainreact.app/api/integrations/oauth/linear/callback`
   - Local dev: `http://localhost:3000/api/integrations/oauth/linear/callback`
     (Linear allows localhost redirect URIs; register both or use separate apps
     per environment.)
3. Copy the **Client ID** and **Client secret**.

No Linear "MCP-specific" app exists or is needed: per Linear's docs
(linear.app/docs/mcp), access tokens from a regular OAuth application are
accepted as `Authorization: Bearer` by `https://mcp.linear.app/mcp`. See
[`research.md`](./research.md).

## 2. Environment variables

| Var | Value |
|---|---|
| `LINEAR_CLIENT_ID` | from step 1 |
| `LINEAR_CLIENT_SECRET` | from step 1 |

Already-required shared vars: `NEXT_PUBLIC_APP_URL`, `TOKEN_ENCRYPTION_KEY`,
`OAUTH_STATE_SIGNING_KEY`. E2E-only overrides (never set in prod):
`LINEAR_AUTHORIZE_BASE`, `LINEAR_TOKEN_BASE`, `LINEAR_API_BASE`.

## 3. Scopes & token behavior (owner awareness)

- Requested scopes: `read,write` (comma-separated — Linear's format).
- **Access tokens live 24 hours; refresh tokens rotate on every use**
  (mandatory for all Linear OAuth apps since 2026-04-01, 30-minute replay
  grace). V2's refresh lock + rotate-persist policy handles this; no owner
  action needed beyond correct env vars.
- Disconnect/purge calls `POST https://api.linear.app/oauth/revoke`
  (best-effort).

## 4. Verifying the connection (manual smoke, until CS-6 certification)

Because the provider is `isExperimental`, it does not render on the Apps page
catalog. To smoke the connect flow locally:

1. Set the env vars above; start the dev server.
2. Trigger connect directly:
   `POST /api/integrations/oauth/linear/connect` from a signed-in session
   (same route every provider uses), or temporarily flip
   `isExperimental: false` in a LOCAL working tree.
3. Complete Linear's consent screen → callback should land you back with an
   active `integrations` row (provider `linear`, display name = your Linear
   name, provider_account_id = your Linear user UUID).
4. Health: after >24h, the first refresh proves rotation persists (row keeps
   working; `access_token_expires_at` advances).

## 5. Not configured in this slice

- No MCP tool calls are made anywhere (executor is CS-3).
- No builder metadata, no actions, no triggers, no option sources.
- The MCP AS at `https://mcp.linear.app` (open DCR, PKCE S256) is NOT used by
  this connect flow — recorded in `research.md` in case a future slice needs
  an MCP-AS-issued token instead.
