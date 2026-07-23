# Linear — MCP + OAuth Research (CS-1 MCP-AUTH)

Research date: 2026-07-22 (live probes stamped 2026-07-23 UTC by server date
headers). Sources: linear.app/docs/mcp, linear.app/developers/oauth-2-0-authentication,
linear.app/developers/rate-limiting, plus live fetches of the well-known
documents on `mcp.linear.app`. Anything not confirmed by a primary source is
marked **[unverified]**.

## MCP server

- Endpoints: `https://mcp.linear.app/mcp` (primary, read-write, **Streamable
  HTTP**) and `https://mcp.linear.app/mcp/readonly` (read-only tool set).
  `https://mcp.linear.app/sse` is documented as a deprecated fallback but
  live-probed **404** unauthenticated — do not build on it.
- Docs reference the authenticated remote MCP spec dated 2025-03-26; live
  auth behavior (RFC 9728 PRM + `WWW-Authenticate: resource_metadata=…`
  challenge) matches the 2025-06-18 auth spec. Negotiated `protocolVersion`
  values **[unverified — needs an authenticated `initialize`; CS-3 item]**.
- No MCP-specific rate limits published; assume underlying API limits
  (OAuth app: 5,000 req/hr per user + 2M GraphQL complexity points/hr).

## MCP authorization server (live-probed raw JSON)

`GET https://mcp.linear.app/.well-known/oauth-protected-resource` (root and
`/mcp` path-aware forms identical):

```json
{"resource":"https://mcp.linear.app/mcp","authorization_servers":["https://mcp.linear.app"],"scopes_supported":["read","write"],"bearer_methods_supported":["header"]}
```

`GET https://mcp.linear.app/.well-known/oauth-authorization-server` (key fields):

- issuer `https://mcp.linear.app`; authorize `/authorize`; token `/token`;
  registration `/register`; scopes `read write openid email`;
  `code_challenge_methods_supported: ["S256"]` (S256 ONLY);
  `token_endpoint_auth_methods_supported: ["client_secret_basic","client_secret_post","none"]`;
  CIMD supported; grant types `authorization_code`, `refresh_token`,
  `jwt-bearer` (ID-JAG / Okta enterprise-managed auth);
  `revocation_endpoint` verbatim equals the TOKEN endpoint (vendor metadata
  quirk — noted, not relied on).
- **DCR is open and anonymous**: an RFC 7591 `POST /register` with no
  credentials returned `201` and a public client (`token_endpoint_auth_method:
  "none"`). Redirect-URI matching at authorize time is strict/exact.
- Whether a STATIC client (regular Linear OAuth app credentials) is accepted
  at this AS: **[unverified]**.
- Whether `/token` REJECTS requests lacking RFC 8707 `resource`:
  **[unverified]** (single-resource server; spec says clients SHOULD send it).
- MCP-AS token lifetime / rotation semantics: **[unverified]**.
- Identity resolution for an MCP-AS-issued token (audience = the MCP server):
  no documented "who am I"; whether such a token works against
  `api.linear.app/graphql`: **[unverified, likely not — audience-bound]**.

## Regular Linear OAuth (the path CS-1 ships)

- Authorize `https://linear.app/oauth/authorize`, token
  `https://api.linear.app/oauth/token` (form-encoded, body-auth client
  credentials). Scopes are **comma-separated**: `read` (baseline), `write`,
  `issues:create`, `comments:create`, `timeSchedule:write`, `admin`, plus
  agent scopes `app:assignable` / `app:mentionable`. PKCE `plain`/`S256`
  supported (V2 always sends S256). Localhost redirect URIs allowed (docs'
  own examples use them).
- **Token model changed 2026-04-01** (docs, exact quote: "All OAuth2
  applications were migrated to the new refresh token system"): access tokens
  valid **24 hours**; **refresh tokens issued always and rotate on every
  use**, 30-minute replay grace window. Client-credentials tokens: 30 days.
- Revocation: `POST https://api.linear.app/oauth/revoke`.
- `actor` param: `user` (default) or `app` (agent/service-account identity);
  V2 uses the default `user`.
- **Vendor-documented bridge to MCP**: the MCP server "supports passing OAuth
  token and API keys directly in the `Authorization: Bearer` header instead
  of using the interactive authentication flow", explicitly including
  integrating "with an existing Linear OAuth application without an extra
  authentication hop" (linear.app/docs/mcp). This is why CS-1 uses the
  regular flow with a static app (also the approved plan §4.2's preferred
  static-registration branch) — the issued token serves BOTH
  `api.linear.app` (GraphQL identity, future option resolvers) and
  `mcp.linear.app` (CS-3 executor).

## Decision record (CS-1)

| Decision | Choice | Why |
|---|---|---|
| Auth home | Regular Linear OAuth, static app, via shared helper `static` mode | Fully documented end-to-end; identity via GraphQL `viewer`; token valid for both API + MCP; plan §4.2 prefers static registration |
| MCP-AS / DCR flow | NOT used for Linear; helper's `discovered` mode ships + is test-proven for the next vendor whose auth home is its MCP AS | Static-cred acceptance, identity, and token semantics at Linear's MCP AS are [unverified] |
| PKCE | Always S256 | OAuth 2.1 / MCP baseline; Linear supports it on both ASes |
| `resource` param | Omitted on Linear's regular AS; auto-sent in `discovered` mode | Undocumented on the regular AS; single-audience token documented to work at MCP |
| providerAccountId | GraphQL `viewer.id` (stable UUID) | Emails can change; id cannot |
| Refresh | `requireRefreshToken: true`, rotate-persist | 24h tokens + mandatory rotation since 2026-04-01 |
