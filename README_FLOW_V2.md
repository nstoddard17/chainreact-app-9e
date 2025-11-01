## Flow v2 Overview

Flow v2 is the Kadabra-style workflow builder that ships under `/workflows/v2`. It provides deterministic node execution, rich schema validation, versioning, scheduling, and publish workflows on top of Supabase. The runtime is fully serverless-friendly: all persistence is handled through Supabase tables created during the parity sprint (`flow_v2_*`, `v2_secrets`, `v2_oauth_tokens`, etc.).

---

## Local Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run the latest migrations**
   ```bash
   supabase db push
   ```
   > The migration `20251028000100_flow_v2_rbac.sql` introduces workspace memberships, RLS policies, and the node log writer.

3. **Enable the feature flag**
   Add to your environment (e.g. `.env.local`):
   ```env
   FLOW_V2_ENABLED=true
   FLOW_V2_SECRET_KEY=32_byte_hex_or_base64_value
   ```

4. **Start the app**
   ```bash
   npm run dev
   ```

5. **Smoke test the builder**
   Visit `http://localhost:3000/workflows/v2`, create a flow, run it, and confirm the logs tab populates.

---

## Environment Variables

| Key | Description |
| --- | ----------- |
| `FLOW_V2_ENABLED` | Gate for all `/workflows/v2` routes (UI + APIs). Defaults to `true` when unset. |
| `FLOW_V2_SECRET_KEY` | 32-byte key used by the secrets module (AES-256-GCM). Falls back to `SECRET_ENCRYPTION_KEY` if present. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required for client + server Supabase access. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for service clients invoked inside middleware/route handlers. |

---

## Secrets Workflow

1. Open the builder and choose **Save as template** or configure nodes that reference secrets.
2. Use the **Secrets** dialog in the inspector to create or reference secrets.
3. Secrets are encrypted with `FLOW_V2_SECRET_KEY` and written into `v2_secrets`.
4. Runtime resolution occurs during node execution (`resolveConfigSecrets`) and values are automatically redacted in logs and snapshots.
5. `GET /workflows/v2/api/secrets?workspaceId=<uuid>` scopes listings by workspace membership; `POST` requires editor access.

---

## Templates & Scheduling

### Templates
- Saving a template stores the graph + revision metadata in `flow_v2_templates`.
- Instantiating a template clones the graph and keeps it within the current workspace.
- Templates UI lives at `/workflows/v2/templates`, with helper APIs under `/workflows/v2/api/templates`.

### Schedules
- Schedules are stored in `flow_v2_schedules`; every entry is tied to a workspace and flow.
- CRUD endpoints live in `/workflows/v2/api/schedules`.
- The scheduler worker (`/workflows/v2/api/schedules/tick`) recomputes `next_run_at` and enqueues runs.
- Only workspace editors can mutate schedules; viewers can list them.

---

## Versioning & Publish

1. Every save produces a new revision in `flow_v2_revisions`.
2. Publishing flips the `published` flag and records a snapshot in `flow_v2_published_revisions`.
3. The builder highlights whether the current revision is published and allows diffing stored revisions.

---

## Costing & Observability

- Node execution tracks estimated vs. actual costs (`costHint`, `NodeRunSnapshot`).
- `flow_v2_node_logs` captures structured per-node logs `{ status, latency_ms, cost, retries }`.
- The builder’s right-side inspector now includes a **Logs** tab per node and a run summary banner.
- Consecutive failures trigger a toast notification to highlight unhealthy flows.
- `GET /workflows/v2/api/health` surfaces:
  ```jsonc
  {
    "ok": true,
    "db": "ok",
    "pendingRuns": 0,
    "lastRun": { "id": "run-123", "status": "success", "finishedAt": "2025-10-27T08:30:00Z" }
  }
  ```

---

## Visual Tokens & Parity

- Builder styles are centralized inside `components/workflows/FlowV2Builder.module.css` on the `.root` selector via CSS custom properties. Update the variables there first before adjusting individual rules.
- The Flow V2 builder consumes these tokens through `FlowV2Builder.module.css` so the layout matches the legacy chrome. Keep class names aligned with the legacy builder when possible for easier diffing.
- The Flow V2 builder is now the canonical experience; parity checks against the legacy builder have been retired. Capture visual baselines from `/workflows/builder/<id>` when taking new screenshots.

---

## cURL Examples

> Replace `SUPABASE_TOKEN` with an access token; RLS enforces workspace membership.

**Health**
```bash
curl -H "Authorization: Bearer SUPABASE_TOKEN" \
  http://localhost:3000/workflows/v2/api/health
```

**Trigger a run**
```bash
curl -X POST \
  -H "Authorization: Bearer SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"payload": {"message": "Hello"}}}' \
  http://localhost:3000/workflows/v2/api/flows/<flow-id>/runs
```

**Inspect run logs**
```bash
curl -H "Authorization: Bearer SUPABASE_TOKEN" \
  http://localhost:3000/workflows/v2/api/runs/<run-id>
```

**Create a schedule**
```bash
curl -X POST \
  -H "Authorization: Bearer SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "flowId": "<flow-id>", "cronExpression": "0 * * * *", "timezone": "UTC" }' \
  http://localhost:3000/workflows/v2/api/schedules
```

---

## Troubleshooting

- **404 on `/workflows/v2`** → Verify `FLOW_V2_ENABLED=true`.
- **Secrets failing to decrypt** → Ensure the key is 32 bytes. Restart after updating env vars.
- **Unauthorized responses** → Confirm the user is a member of the target workspace (`workspace_memberships`).
- **Missing logs** → Check that migrations have been applied. The node logger writes to `flow_v2_node_logs` during each run.

---

## Quick Start Checklist

- [ ] Supabase migrations applied (`supabase db push`)
- [ ] `FLOW_V2_ENABLED` set
- [ ] `FLOW_V2_SECRET_KEY` configured
- [ ] Health endpoint returns `{ db: "ok" }`
- [ ] Builder logs tab displays per-node entries after a run
- [ ] Publish flow and confirm `/templates` and `/schedules` operate within workspace context
