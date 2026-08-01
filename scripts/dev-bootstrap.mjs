#!/usr/bin/env node
/**
 * SUPABASE-ENV-PIPELINE-1 — synthetic development bootstrap.
 *
 * Creates the auth-dependent fixtures that a SQL seed file cannot safely
 * express (auth users must go through the supported auth.admin API, never raw
 * inserts into auth.users):
 *
 *   - dev-owner@chainreact.test    (each gets a personal account auto-
 *   - dev-member@chainreact.test    provisioned by the handle_new_user trigger:
 *   - dev-outsider@chainreact.test  user_profiles, accounts, memberships, billing)
 *   - one sample draft workflow in dev-owner's account
 *
 * Deliberately NOT here: cross-account/team memberships. Personal accounts
 * enforce a single owner membership (account_memberships_enforce_personal_
 * invariants); team-account fixtures belong to the RLS suites that construct
 * them through the supported paths.
 *
 * Idempotent: re-running updates nothing that already exists.
 * NO production data, NO real emails, NO provider credentials, NO tokens.
 *
 * Targets (fail closed, see scripts/lib/env-target.mjs):
 *   local:        CHAINREACT_DB_TARGET=local  — uses the loopback stack's URL +
 *                 service key from .env.test.local (or process env).
 *   development:  CHAINREACT_DB_TARGET=development — requires
 *                 SUPABASE_DEV_PROJECT_REF + SUPABASE_DEV_URL +
 *                 SUPABASE_DEV_SERVICE_ROLE_KEY (process env or
 *                 .env.development.local). Production refs are denylisted.
 *
 * DEV_BOOTSTRAP_PASSWORD must be provided (min 12 chars); it is the shared
 * password for the synthetic users and is never printed.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "./lib/db-target.mjs";
import { resolveDbTarget, isLoopbackUrl } from "./lib/env-target.mjs";

const target = process.env.CHAINREACT_DB_TARGET;
const fileEnvPath = resolve(
  process.cwd(),
  target === "development" ? ".env.development.local" : ".env.test.local",
);
// CHAINREACT_ENV_FILE=none skips the gitignored env file — used by the guard
// tests to stay hermetic on machines where real dev credentials exist.
const fileEnv =
  process.env.CHAINREACT_ENV_FILE !== "none" && existsSync(fileEnvPath)
    ? loadEnvFile(readFileSync, fileEnvPath)
    : {};
const env = { ...fileEnv, ...process.env };

const expectedTarget = target === "development" ? "development" : "local";
const guard = resolveDbTarget(env, { expectedTarget });
if (!guard.ok) {
  console.error(`ABORT — env-target guard: ${guard.reason}`);
  process.exit(1);
}

let url;
let serviceKey;
if (guard.target === "development") {
  url = env.SUPABASE_DEV_URL;
  serviceKey = env.SUPABASE_DEV_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("ABORT — SUPABASE_DEV_URL and SUPABASE_DEV_SERVICE_ROLE_KEY are required for development bootstrap.");
    process.exit(1);
  }
} else {
  url = env.NEXT_PUBLIC_SUPABASE_URL;
  serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !isLoopbackUrl(url)) {
    console.error("ABORT — local bootstrap requires a loopback NEXT_PUBLIC_SUPABASE_URL (run `npm run supabase:test:start` first).");
    process.exit(1);
  }
  if (!serviceKey) {
    console.error("ABORT — SUPABASE_SERVICE_ROLE_KEY missing (should be in .env.test.local).");
    process.exit(1);
  }
}

const password = env.DEV_BOOTSTRAP_PASSWORD;
if (!password || password.length < 12) {
  console.error("ABORT — DEV_BOOTSTRAP_PASSWORD (min 12 chars) is required. It is never printed or stored.");
  process.exit(1);
}

console.log(`Bootstrap target: ${guard.target}${guard.ref ? ` (ref ${guard.ref})` : " (loopback)"}`);

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const USERS = [
  { email: "dev-owner@chainreact.test", name: "Dev Owner" },
  { email: "dev-member@chainreact.test", name: "Dev Member" },
  { email: "dev-outsider@chainreact.test", name: "Dev Outsider" },
];

async function ensureUser({ email, name }) {
  // listUsers + filter: admin.getUserByEmail is not available in supabase-js v2.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const existing = data.users.find((u) => u.email === email);
  if (existing) {
    console.log(`  = ${email} (exists)`);
    return existing.id;
  }
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, synthetic: true },
  });
  if (createErr) throw new Error(`createUser(${email}) failed: ${createErr.message}`);
  console.log(`  + ${email}`);
  return created.user.id;
}

async function ownedAccountId(userId) {
  const { data, error } = await admin
    .from("account_memberships")
    .select("account_id, role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .limit(1);
  if (error) throw new Error(`account lookup failed: ${error.message}`);
  if (!data?.length) throw new Error(`no owned account for user ${userId} — handle_new_user trigger missing?`);
  return data[0].account_id;
}

/**
 * The canonical EMPTY definition shape (contracts/workflowDefinition.ts
 * EMPTY_WORKFLOW_DEFINITION — duplicated here because this .mjs script cannot
 * import the TS contract; tests/unit/pipeline/dev-bootstrap-definition.test.ts
 * pins the two to the same shape). A raw `{}` is NOT canonical: the app's
 * repository default is `{ nodes: [], edges: [] }`, and the original `{}`
 * insert crashed the dashboard (HOSTED-DEV-WORKFLOW-DEFINITION-CRASH-1).
 */
const CANONICAL_EMPTY_DEFINITION = { nodes: [], edges: [] };

function isCanonicalDefinition(d) {
  return Boolean(d) && typeof d === "object" && Array.isArray(d.nodes) && Array.isArray(d.edges);
}

async function ensureSampleWorkflow(accountId, userId) {
  const NAME = "Dev Sample — Welcome (synthetic)";
  const { data, error } = await admin
    .from("workflows")
    .select("id, draft_definition")
    .eq("account_id", accountId)
    .eq("name", NAME)
    .limit(1);
  if (error) throw new Error(`workflow lookup failed: ${error.message}`);
  if (data?.length) {
    const row = data[0];
    if (isCanonicalDefinition(row.draft_definition)) {
      console.log(`  = sample workflow (exists, canonical)`);
      return;
    }
    // Repair path: ONLY this synthetic row (matched by exact name inside the
    // synthetic owner's account) is ever rewritten — never a user-created
    // workflow. Idempotent: once canonical, reruns take the branch above.
    const { error: updErr } = await admin
      .from("workflows")
      .update({ draft_definition: CANONICAL_EMPTY_DEFINITION })
      .eq("id", row.id);
    if (updErr) throw new Error(`workflow repair failed: ${updErr.message}`);
    console.log(`  ~ sample workflow repaired to the canonical definition shape`);
    return;
  }
  const { error: insErr } = await admin.from("workflows").insert({
    account_id: accountId,
    created_by_user_id: userId,
    name: NAME,
    draft_definition: CANONICAL_EMPTY_DEFINITION,
  });
  if (insErr) throw new Error(`workflow insert failed: ${insErr.message}`);
  console.log(`  + sample draft workflow`);
}

console.log("Users:");
const ownerId = await ensureUser(USERS[0]);
await ensureUser(USERS[1]);
await ensureUser(USERS[2]);

console.log("Account wiring:");
const accountId = await ownedAccountId(ownerId);
await ensureSampleWorkflow(accountId, ownerId);

console.log("✅ dev bootstrap complete (synthetic data only; no values printed).");
