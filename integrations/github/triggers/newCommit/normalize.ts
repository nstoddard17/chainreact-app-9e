import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Convert a GitHub webhook delivery to V2's canonical `TriggerEvent`
 * shape — Slice 14b Commit 4.
 *
 * GitHub's wire format:
 *   - Routing metadata in HEADERS:
 *       `X-GitHub-Event` (e.g. "push"),
 *       `X-GitHub-Delivery` (per-delivery UUID — dedup key),
 *       `X-Hub-Signature-256` (HMAC, verified upstream of normalize),
 *       `X-GitHub-Hook-ID` (the webhook resource id, useful for
 *       diagnostics).
 *   - Body shape varies by event. For `push`:
 *       `{ ref, before, after, repository, pusher, sender, head_commit,
 *         commits[], created, deleted, forced, ... }`
 *
 * Slice 14b plan §"Webhook payload": forwards the raw GitHub event
 * under `payload.body` so workflows can drill into commit fields
 * directly via `{{nodeId.payload.body.head_commit.message}}`-style
 * references. Also surfaces a small set of derived top-level fields
 * (`branch`, `repository`, `commits`, etc.) for ergonomic workflow
 * authoring without forcing every workflow to navigate the body
 * shape.
 *
 * Per Slice 14b plan §"Dedup key strategy": the dedup key is the
 * `X-GitHub-Delivery` UUID (preferred). When absent (legacy delivery
 * paths or test harnesses that omit it), V2 falls back to a derived
 * `${repo}:${event}:${head_commit.id || ref}` key — deterministic
 * but coarser.
 *
 * Canonical TriggerEvent fields:
 *   - `provider: "github"`.
 *   - `eventType: "new_commit"` — the V2 trigger name (matches
 *     `findActivation("github", "new_commit")`). Workflows branch on
 *     `payload.eventName` for the underlying GitHub event when more
 *     event types are added in future slices.
 *   - `eventId` — dedup key. Used by `webhook_event_dedup` to block
 *     retries.
 *   - `occurredAt` — ISO-8601. Prefers `head_commit.timestamp`; falls
 *     back to `now()`.
 *   - `accountId` — repository owner login (matches the integration's
 *     `providerAccountId` for personal repos; org owner login for org
 *     repos).
 *   - `payload` carries `eventName` / `deliveryId` / `repository` /
 *     `branch` / `before` / `after` / `pusher` / `sender` / `commits`
 *     / `head_commit` / raw `body` for downstream consumption.
 */

export const GITHUB_TRIGGER_EVENT_TYPE = "new_commit";

export interface GitHubHeaders {
  /** `X-GitHub-Event`. e.g. "push", "ping". */
  eventName: string;
  /**
   * `X-GitHub-Delivery` — per-delivery UUID. Preferred dedup key.
   * May be null only for malformed / test deliveries.
   */
  deliveryId: string | null;
  /** `X-GitHub-Hook-ID` — the hook resource id. May be null. */
  hookId: string | null;
}

export interface NormalizeGitHubEventInput {
  headers: GitHubHeaders;
  /** Parsed GitHub `push` event body. */
  body: Record<string, unknown>;
}

interface PushBodyRepository {
  full_name?: string;
  name?: string;
  owner?: { login?: string; name?: string };
}

interface PushBodyCommit {
  id?: string;
  message?: string;
  url?: string;
  timestamp?: string;
  author?: {
    name?: string;
    email?: string;
    username?: string;
  };
  added?: string[];
  modified?: string[];
  removed?: string[];
}

function getString(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function getRepoFullName(body: Record<string, unknown>): string | null {
  const repo = body.repository as PushBodyRepository | undefined;
  if (!repo) return null;
  if (typeof repo.full_name === "string" && repo.full_name.length > 0) {
    return repo.full_name;
  }
  return null;
}

function getRepoOwner(body: Record<string, unknown>): string | null {
  const repo = body.repository as PushBodyRepository | undefined;
  if (!repo) return null;
  const owner = repo.owner;
  if (owner && typeof owner.login === "string" && owner.login.length > 0) {
    return owner.login;
  }
  // Some legacy GitHub payloads use `owner.name` (rare; fallback only).
  if (owner && typeof owner.name === "string" && owner.name.length > 0) {
    return owner.name;
  }
  // Fall back to extracting from full_name if present.
  const full = getRepoFullName(body);
  if (full) {
    const slash = full.indexOf("/");
    if (slash > 0) return full.slice(0, slash);
  }
  return null;
}

function getBranch(body: Record<string, unknown>): string | null {
  const ref = getString(body, "ref");
  if (!ref) return null;
  // GitHub push refs come in `refs/heads/<branch>`. Tag pushes come in
  // `refs/tags/<tag>` — V2 doesn't filter those out at normalize
  // (workflow-config branch filter does the filtering); we just strip
  // the well-known heads prefix.
  if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
  return ref;
}

function getHeadCommit(
  body: Record<string, unknown>,
): PushBodyCommit | null {
  const hc = body.head_commit;
  if (hc && typeof hc === "object" && !Array.isArray(hc)) {
    return hc as PushBodyCommit;
  }
  return null;
}

function bestOccurredAt(body: Record<string, unknown>): string {
  const head = getHeadCommit(body);
  if (head && typeof head.timestamp === "string" && head.timestamp.length > 0) {
    return head.timestamp;
  }
  return new Date().toISOString();
}

function fallbackDedupKey(
  headers: GitHubHeaders,
  body: Record<string, unknown>,
): string {
  // `${repo}:${event}:${head_commit.id || ref}`. Deterministic for the
  // rare paths where X-GitHub-Delivery is absent (test harnesses,
  // truncated proxy traffic). Coarser than the UUID — workflows that
  // process retries while head_commit is unchanged would dedup.
  const repo = getRepoFullName(body) ?? "no-repo";
  const head = getHeadCommit(body);
  const id =
    head && typeof head.id === "string" && head.id.length > 0
      ? head.id
      : getString(body, "ref") ?? "no-ref";
  return `${repo}:${headers.eventName}:${id}`;
}

export function normalizeGitHubEvent(
  input: NormalizeGitHubEventInput,
): TriggerEvent {
  const eventId = input.headers.deliveryId
    ? input.headers.deliveryId
    : fallbackDedupKey(input.headers, input.body);

  const repository = getRepoFullName(input.body);
  const owner = getRepoOwner(input.body);
  const branch = getBranch(input.body);
  const head = getHeadCommit(input.body);
  const commitsRaw = input.body.commits;
  const commits = Array.isArray(commitsRaw) ? commitsRaw : [];

  return {
    provider: "github",
    eventType: GITHUB_TRIGGER_EVENT_TYPE,
    eventId,
    occurredAt: bestOccurredAt(input.body),
    // providerAccountId: prefer the repo owner login (stable per-repo). Falls
    // back to `"unknown"` defensively — TriggerEvent contract requires
    // a non-empty string.
    providerAccountId: owner ?? "unknown",
    payload: {
      eventName: input.headers.eventName,
      deliveryId: input.headers.deliveryId,
      hookId: input.headers.hookId,
      repository,
      owner,
      branch,
      ref: getString(input.body, "ref"),
      before: getString(input.body, "before"),
      after: getString(input.body, "after"),
      pusher: input.body.pusher ?? null,
      sender: input.body.sender ?? null,
      head_commit: head ?? null,
      commits,
      // Forward the raw event body so workflow authors who need fields
      // we didn't surface above can still access them.
      body: input.body,
    },
  };
}
