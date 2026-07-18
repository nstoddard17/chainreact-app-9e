# Runbook — Isolated local Supabase + the machine-credential RLS proof

Stand up a **throwaway local Supabase** and run the machine-credential security
test against it. Provider-neutral: this validates the `account_machine_credentials`
/ `machine_credential_audit` store (first consumer: ADP), not any one provider.

> ## ⛔ SAFETY — READ FIRST
> **Never run `db:push`, `supabase db reset`, or any migration/DDL command until
> you have POSITIVELY VERIFIED the target is the isolated LOCAL instance
> (host `127.0.0.1` / `localhost`).**
> - `npm run db:push` reads `POSTGRES_URL_NON_POOLING` from **`.env.local`**, which
>   points at the **remote** V2 project — it is NOT for local use. Do not use it here.
> - `supabase db reset` **drops and recreates** the database it targets. Only ever
>   let it target the local stack you started with `supabase start`.
> - Do the [Verify the target is local](#4-verify-the-target-is-local) step before
>   step 5, every time.

---

## 1. Prerequisites
| Need | Notes |
|---|---|
| **Docker** (running) | Supabase's local stack runs in Docker. `docker ps` must succeed. |
| **Supabase CLI** ≥ 1.x | `supabase --version`. Install per the official docs; do not link it to a remote project. |
| **Node + npm** | Already required by the repo. |
| **Free ports** | Local Supabase defaults: API `54321`, DB (Postgres) `54322`, Studio `54323`, Inbucket/mail `54324`, analytics `54327`. All must be free. |

This runbook installs nothing and starts nothing on your behalf — run the commands yourself.

## 2. Initialize local Supabase (only if `supabase/config.toml` is absent)
The repo ships `supabase/migrations/` but may not ship a `config.toml`. If it's missing:
```bash
supabase init            # creates supabase/config.toml for the LOCAL stack only
```
- This does **not** link to any remote project and creates no network resources.
- **Do not run `supabase link`** — linking associates the CLI with a remote project and is exactly what we're avoiding. If a linked project already exists, `supabase unlink` first (or work in a fresh clone).
- Treat a newly-created `config.toml` as a local-only artifact; do not commit it unless the team decides to (out of scope for this runbook).

## 3. Start the local stack (no remote linkage)
```bash
supabase start          # boots Postgres + Auth + PostgREST etc. in Docker, locally
supabase status         # prints the LOCAL URLs + keys — copy these
```
`supabase status` prints, for the local instance only:
- **API URL** → `http://127.0.0.1:54321`
- **DB URL** → `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **anon key** and **service_role key** (local, throwaway).

## 4. Verify the target is local
Confirm **all** of these before applying anything:
```bash
supabase status | grep -Ei "API URL|DB URL"    # must show 127.0.0.1 / localhost
docker ps --format '{{.Names}} {{.Ports}}' | grep supabase   # containers are local
```
- API/DB hosts MUST be `127.0.0.1` (or `localhost`). If you see any `*.supabase.co`
  host, **STOP** — you are pointed at a remote; do not proceed.
- Do **not** rely on `npm run check:db-target` here — that guard validates the
  **remote** `.env.local` target, not the local stack.

## 5. Apply migration `20260722000000` (local only)
Use the CLI's local reset — it targets the stack `supabase start` booted, **not**
`.env.local`:
```bash
supabase db reset        # drops + recreates the LOCAL db and applies ALL migrations
```
- This applies every migration in `supabase/migrations/`, including
  `20260722000000_account_machine_credentials.sql`.
- ⚠️ Never point `db reset` at anything but the local stack (see the safety box).
- Do **not** use `npm run db:push` for this — it targets the remote.

Verify the tables landed (local DB):
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "\dp public.account_machine_credentials" \
  -c "\dp public.machine_credential_audit"
# Expect: RLS enabled, GRANTs to service_role only (no 'authenticated'/'anon').
```

## 6. Local environment variables for the test (placeholders only)
The integration test reads env vars; **inline exports take precedence over
`.env.local`** (the test only fills a var if it isn't already set), so setting
these on the command line safely overrides the remote values in `.env.local`.
Use the LOCAL values from `supabase status` — never real remote keys:
```bash
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="<local-anon-key-from-supabase-status>"
export SUPABASE_SERVICE_ROLE_KEY="<local-service-role-key-from-supabase-status>"
export TOKEN_ENCRYPTION_KEY="<base64-32-bytes>"   # e.g. openssl rand -base64 32
export ALLOW_DB_INTEGRATION_TESTS="true"
```
- `TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes (`openssl rand -base64 32`).
- These are throwaway local credentials. Do not paste production keys here.

## 7. Run the proof
```bash
ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/security/machine-credentials-rls.test.ts
```
(You can drop the leading `ALLOW_...=` if you already exported it in step 6.)

### Expected assertions (all pass against a correct local DB)
- **authenticated denial** — a signed-in member's direct `SELECT` on both tables → `42501`.
- **anonymous denial** — anon sees nothing on both tables.
- **cross-account isolation** — account B never resolves account A's credential.
- **ciphertext at rest** — stored secret columns contain ciphertext, not the plaintext secret/key.
- **rotation clears cached tokens** — a re-save clears the cached access token and stamps `rotated_at`.
- **secret-free audit rows** — audit `detail` contains no secret; events include `created` + `rotated`.
- **disconnect** — soft-removes the row and clears the cached token.

Without the env vars (or `ALLOW_DB_INTEGRATION_TESTS`), the test **skips cleanly**
and prints a `SKIP` line — it never touches a database it wasn't told to.

## 8. Troubleshooting
| Symptom | Fix |
|---|---|
| **Docker unavailable** (`Cannot connect to the Docker daemon`) | Start Docker Desktop / the daemon, then `supabase start`. The runbook cannot proceed without Docker. |
| **Port collision** (`address already in use`) | Free the port, or set alternate ports in `supabase/config.toml` (`[api] port`, `[db] port`, …) and re-run `supabase start`; update `NEXT_PUBLIC_SUPABASE_URL` / DB URL accordingly. |
| **captcha / auth rejects `createUser`** (`captcha protection: request disallowed`) | That is a **remote** protection — it means you're hitting a remote, not local. Confirm step 4. Local `config.toml` has no captcha by default; ensure `[auth.captcha]` is absent/`enabled = false`. |
| **Migration failure** on `db reset` | Read the failing statement; confirm you're on the intended migration set (`git status supabase/migrations`). Fix forward with a new migration — never hand-edit an applied one. Re-run `supabase db reset`. |
| **Accidental remote linkage** | If `supabase status`/commands show a `*.supabase.co` host or a linked project, `supabase unlink` and re-verify step 4 before doing anything else. Never run `db reset`/`db push` while linked. |
| **Test skips unexpectedly** | One of the 5 env vars is unset (incl. `TOKEN_ENCRYPTION_KEY`). The `SKIP` line names what's missing. |

## 9. Cleanup / reset
```bash
supabase stop                 # stop the local stack (keeps volumes)
supabase stop --no-backup     # stop and DISCARD local data volumes (full teardown)
```
Re-running `supabase db reset` at any time restores a clean local DB with all
migrations applied. Nothing here affects any remote environment.

---

## Related
- [`docs/providers/adp/local-validation-and-ui-report.md`](../providers/adp/local-validation-and-ui-report.md) — why the live proof was deferred + the DB-free proofs that ran.
- [`docs/providers/adp/implementation-status.md`](../providers/adp/implementation-status.md) — the ADP foundation this store underpins.
- Migration: `supabase/migrations/20260722000000_account_machine_credentials.sql`.
- Test: `tests/integration/security/machine-credentials-rls.test.ts` (opt-in).
