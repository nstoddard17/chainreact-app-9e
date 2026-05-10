/**
 * Parse a workflow-config `repository` field into `{ owner, repo }`.
 *
 * Slice 14b Commit 3. Five handlers (`create_issue`,
 * `create_pull_request`, `create_branch`, `add_comment`,
 * `create_pull_request`'s default-branch lookup) all need
 * `owner/repo` decomposition. Centralizing the parse keeps the error
 * shape identical across handlers.
 *
 * The schema layer (Zod regex) ensures the input matches `owner/repo`
 * before this helper runs, so this is a defensive narrow-and-throw
 * in the unlikely event of a schema/handler mismatch.
 */

export function parseRepository(repository: string): { owner: string; repo: string } {
  const slash = repository.indexOf("/");
  if (slash <= 0 || slash === repository.length - 1) {
    throw new Error(
      `Repository must be in 'owner/repo' format (got '${repository}').`,
    );
  }
  const owner = repository.slice(0, slash);
  const repo = repository.slice(slash + 1);
  // Guard against extra slashes — `owner/repo/extra` is malformed.
  if (repo.includes("/")) {
    throw new Error(
      `Repository must be in 'owner/repo' format (got '${repository}').`,
    );
  }
  return { owner, repo };
}
