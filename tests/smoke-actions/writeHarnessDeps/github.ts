/**
 * Write smoke harness deps — GitHub smoke read-back seam + shared-repo staging.
 *
 * GitHub registers NO read actions in V2 (all 6 registered actions are writes),
 * so every write verification goes through this seam's bounded, READ-ONLY GETs
 * (repo / issue / issue-comments / branch-ref / pull-request / gist). Outputs are
 * sanitized projections of OUR smoke-created resources only — the ids/names are
 * ledger-captured, marker-deterministic, or staged by this run. The typed
 * NotFoundError maps to found:false; any other error rethrows (context.ts
 * invariant). Every call runs inside `refreshAndRetry` (seam-refresh-guard; GitHub
 * tokens are non-refreshable, so this is a no-op on success but keeps the same path
 * as the handlers).
 *
 * CONTAINMENT: this seam NEVER targets a discovered/pre-existing repo. Read-backs
 * resolve `owner/repo` only from a fixture config that itself references a
 * staged/ledger crsmoke resource, and staging ONLY ever CREATES fresh crsmoke
 * repositories (it never writes to an existing one).
 *
 * Staging (dev-test-only, Shopify/HubSpot seed precedent):
 *   - `stageGithubSmokeRepo` — creates ONE fresh `crsmoke-` repository
 *     (auto_init:true, private) that the issue / comment / branch / pull-request
 *     fixtures all target, plus a marker head branch carrying a REAL diff commit
 *     (create_pull_request needs commits between head and base; auto_init gives
 *     exactly one commit on the default branch, so staging adds a second commit on
 *     the head branch via the Contents API — no registered action can do this).
 *     remove() is a documented NO-OP: the granted token has no `delete_repo`
 *     scope, so every created repo is an honest left artifact.
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { githubRequest } from "@/integrations/_shared/github/api/_request";
import {
  reposGet,
  userReposCreate,
  gitRefGet,
  gitRefsCreate,
} from "@/integrations/_shared/github/api/repos";
import { NotFoundError } from "@/integrations/_shared/github/errors";
import { parseRepository } from "@/integrations/github/actions/_parseRepository";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

interface GitHubContext {
  readonly providerAccountId: string | null;
  readonly accountId: string;
}

async function resolveGitHub(ctx: SmokeReaderContext): Promise<GitHubContext | null> {
  const integration = await getActiveForExecution(ctx.accountId, "github", null);
  if (!integration) return null;
  return { providerAccountId: integration.providerAccountId, accountId: ctx.accountId };
}

const call = <T>(gh: GitHubContext, fn: (t: string) => Promise<T>): Promise<T> =>
  refreshAndRetry({
    accountId: gh.accountId,
    provider: "github",
    providerAccountId: gh.providerAccountId,
    apiCall: fn,
  });

function strOf(config: Readonly<Record<string, unknown>>, key: string): string {
  const v = config[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return "";
}

/** Wrap a GET: typed 404 -> the caller's `notFound` projection, anything else rethrows. */
async function foundOr404<T extends Record<string, unknown>>(
  read: () => Promise<T>,
  notFound: T,
): Promise<StepRunOutcome> {
  try {
    const output = await read();
    return { ok: true, output, reason: null };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: true, output: notFound, reason: null };
    throw err;
  }
}

interface GitHubIssueLite {
  title?: string;
  body?: string | null;
  state?: string;
}
interface GitHubIssueCommentLite {
  body?: string;
}
interface GitHubPullLite {
  title?: string;
  state?: string;
  head?: { ref?: string };
  base?: { ref?: string };
}
interface GitHubGistLite {
  description?: string | null;
  public?: boolean;
  files?: Readonly<Record<string, unknown>>;
}

/**
 * SMOKE-ONLY read-back for the 6 GitHub write actions. Bounded, READ-ONLY GETs of
 * OUR smoke-created resources. Returns a StepRunOutcome when it owns the (github,
 * action) pair; null otherwise (composer tries the next reader).
 */
export async function githubSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "github") return null;
  const gh = await resolveGitHub(ctx);
  if (!gh) return { ok: false, output: null, reason: "github not connected" };

  // Repo-scoped reads resolve owner/repo from the fixture's repository ref (itself a
  // staged/ledger crsmoke value) — never a discovered repo.
  const repoScoped = (): { owner: string; repo: string } | null => {
    const repository = strOf(input.config, "repository");
    if (!repository) return null;
    try {
      return parseRepository(repository);
    } catch {
      return null;
    }
  };

  if (input.action === "repo_state") {
    const parsed = repoScoped();
    if (!parsed) return { ok: false, output: null, reason: "repo_state: missing/invalid repository" };
    return foundOr404(
      async () => {
        const r = await call(gh, (t) =>
          reposGet({ accessToken: t, owner: parsed.owner, repo: parsed.repo }),
        );
        return {
          found: true,
          name: r.name,
          fullName: r.full_name,
          defaultBranch: r.default_branch,
          private: r.private,
        };
      },
      { found: false, name: "", fullName: "", defaultBranch: "", private: false },
    );
  }

  if (input.action === "issue_state") {
    const parsed = repoScoped();
    const issueNumber = strOf(input.config, "issueNumber");
    if (!parsed || !issueNumber) {
      return { ok: false, output: null, reason: "issue_state: missing repository/issueNumber" };
    }
    return foundOr404(
      async () => {
        const issue = await call(gh, (t) =>
          githubRequest<GitHubIssueLite>({
            accessToken: t,
            method: "GET",
            path: `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/issues/${encodeURIComponent(issueNumber)}`,
            resourceForNotFound: `issue ${parsed.owner}/${parsed.repo}#${issueNumber}`,
          }),
        );
        return { found: true, title: issue.title ?? "", state: issue.state ?? "", body: issue.body ?? "" };
      },
      { found: false, title: "", state: "", body: "" },
    );
  }

  if (input.action === "issue_comments") {
    const parsed = repoScoped();
    const issueNumber = strOf(input.config, "issueNumber");
    if (!parsed || !issueNumber) {
      return { ok: false, output: null, reason: "issue_comments: missing repository/issueNumber" };
    }
    return foundOr404(
      async () => {
        const comments = await call(gh, (t) =>
          githubRequest<GitHubIssueCommentLite[]>({
            accessToken: t,
            method: "GET",
            path: `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/issues/${encodeURIComponent(issueNumber)}/comments`,
            resourceForNotFound: `comments on ${parsed.owner}/${parsed.repo}#${issueNumber}`,
          }),
        );
        return {
          found: true,
          comments: (comments ?? []).map((c) => c.body ?? ""),
          commentCount: (comments ?? []).length,
        };
      },
      { found: false, comments: [], commentCount: 0 },
    );
  }

  if (input.action === "branch_state") {
    const parsed = repoScoped();
    const branch = strOf(input.config, "branch");
    if (!parsed || !branch) {
      return { ok: false, output: null, reason: "branch_state: missing repository/branch" };
    }
    return foundOr404(
      async () => {
        const ref = await call(gh, (t) =>
          gitRefGet({ accessToken: t, owner: parsed.owner, repo: parsed.repo, branch }),
        );
        return { found: true, ref: ref.ref, sha: ref.object.sha };
      },
      { found: false, ref: "", sha: "" },
    );
  }

  if (input.action === "pull_request_state") {
    const parsed = repoScoped();
    const pullRequestNumber = strOf(input.config, "pullRequestNumber");
    if (!parsed || !pullRequestNumber) {
      return { ok: false, output: null, reason: "pull_request_state: missing repository/pullRequestNumber" };
    }
    return foundOr404(
      async () => {
        const pr = await call(gh, (t) =>
          githubRequest<GitHubPullLite>({
            accessToken: t,
            method: "GET",
            path: `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/pulls/${encodeURIComponent(pullRequestNumber)}`,
            resourceForNotFound: `pull request ${parsed.owner}/${parsed.repo}#${pullRequestNumber}`,
          }),
        );
        return {
          found: true,
          title: pr.title ?? "",
          state: pr.state ?? "",
          head: pr.head?.ref ?? "",
          base: pr.base?.ref ?? "",
        };
      },
      { found: false, title: "", state: "", head: "", base: "" },
    );
  }

  if (input.action === "gist_state") {
    const gistId = strOf(input.config, "gistId");
    if (!gistId) return { ok: false, output: null, reason: "gist_state: missing gistId" };
    return foundOr404(
      async () => {
        const gist = await call(gh, (t) =>
          githubRequest<GitHubGistLite>({
            accessToken: t,
            method: "GET",
            path: `/gists/${encodeURIComponent(gistId)}`,
            resourceForNotFound: `gist ${gistId}`,
          }),
        );
        return {
          found: true,
          description: gist.description ?? "",
          public: gist.public ?? false,
          files: Object.keys(gist.files ?? {}),
        };
      },
      { found: false, description: "", public: false, files: [] },
    );
  }

  return null;
}

// ─── Staging: one shared crsmoke repo (+ PR head branch with a diff) ───────────

export interface StagedGitHubRepo {
  /** `owner/repo` of the freshly-created shared crsmoke repository. */
  readonly repository: string;
  /** Marker head branch carrying a diff commit (create_pull_request head). */
  readonly prHeadBranch: string;
  /**
   * NO-OP: the granted token has no `delete_repo` scope, so the repo is an honest
   * left artifact. Kept for staging-pattern symmetry (a future scope grant would
   * make this a real teardown).
   */
  readonly remove: () => Promise<void>;
}

/** Base64-encode a UTF-8 string for the Contents API (Node Buffer; test-only). */
function toBase64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/**
 * Create ONE fresh `crsmoke-` repository (auto_init, private) that the issue /
 * comment / branch / pull-request fixtures target, plus a marker head branch with a
 * real diff commit for create_pull_request. Returns null on any failure (the
 * dependent fixtures then report BLOCKED_ENV — never a mutation against the wrong
 * repo). CONTAINMENT: only ever CREATES a fresh repo; never touches an existing one.
 */
export async function stageGithubSmokeRepo(
  accountId: string,
  userId: string,
  markerPrefix: string,
): Promise<StagedGitHubRepo | null> {
  const gh = await resolveGitHub({ accountId, userId });
  if (!gh) return null;
  try {
    // 1. Fresh shared repo with an initial commit on the default branch.
    const repo = await call(gh, (t) =>
      userReposCreate({
        accessToken: t,
        name: `${markerPrefix}shared`,
        description: `${markerPrefix}shared smoke repo - safe to delete`,
        private: true,
        auto_init: true,
      }),
    );
    const fullName = repo.full_name;
    const defaultBranch = repo.default_branch;
    const { owner, repo: repoName } = parseRepository(fullName);

    // 2. Marker head branch off the default branch's tip.
    const prHeadBranch = `${markerPrefix}prhead`;
    const baseRef = await call(gh, (t) =>
      gitRefGet({ accessToken: t, owner, repo: repoName, branch: defaultBranch }),
    );
    await call(gh, (t) =>
      gitRefsCreate({
        accessToken: t,
        owner,
        repo: repoName,
        branchName: prHeadBranch,
        sha: baseRef.object.sha,
      }),
    );

    // 3. A real diff commit on the head branch ONLY (Contents API) so head and base
    //    differ — create_pull_request 422s ("No commits between ...") otherwise. No
    //    registered action commits file contents, so staging owns this write.
    await call(gh, (t) =>
      githubRequest<Record<string, unknown>>({
        accessToken: t,
        method: "PUT",
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/contents/${encodeURIComponent(`${markerPrefix}diff.txt`)}`,
        body: {
          message: `${markerPrefix}pr diff commit`,
          content: toBase64(`${markerPrefix}pr diff body - safe to ignore\n`),
          branch: prHeadBranch,
        },
        resourceForNotFound: `contents on ${owner}/${repoName}@${prHeadBranch}`,
      }),
    );

    return {
      repository: fullName,
      prHeadBranch,
      // No delete_repo scope -> honest left artifact.
      remove: async () => {},
    };
  } catch {
    return null;
  }
}
