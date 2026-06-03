import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Execution-scoped credential-resolution context (Slice 4.ACCOUNT-MODEL-22B).
 *
 * Carries the provenance the credential resolver needs to enforce the
 * personal-credential policy WITHOUT threading a new argument through all ~375
 * `refreshAndRetry` call sites in provider handlers.
 *
 * The execution engine wraps each action-handler invocation in
 * `runWithCredentialResolutionContext({ createdByUserId })`; deep inside the
 * handler, `refreshAndRetry` reads the context via `getCredentialResolutionContext()`
 * and — for PERSONAL providers only (see `core/integrations/credentialSharing.ts`)
 * — pins the integration lookup to `connected_by_user_id = createdByUserId`. So a
 * Team workflow can only use the personal credential its creator connected, never
 * a co-member's.
 *
 * `AsyncLocalStorage` propagates across `await`s within the same async call
 * tree (Node runtime — the engine runs server-side in the background after a
 * webhook returns), so a handler's nested `await refreshAndRetry(...)` →
 * `await getActiveForExecution(...)` all observe the store the engine set.
 *
 * When NO context is present (unit tests calling a handler directly, trigger
 * polling, the options route, or any non-engine caller), the resolver falls back
 * to the pre-22B account-scoped behavior — this slice changes nothing for those
 * paths and keeps existing tests green.
 */
export interface CredentialResolutionContext {
  /**
   * The workflow's `created_by_user_id` — the single user whose PERSONAL
   * credentials this run may resolve. Null when the run has no attributable
   * creator (the resolver then does not pin, i.e. account-scoped fallback).
   */
  createdByUserId: string | null;
}

const storage = new AsyncLocalStorage<CredentialResolutionContext>();

/** Run `fn` with the given credential-resolution context active. */
export function runWithCredentialResolutionContext<T>(
  context: CredentialResolutionContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/** Read the active context, or `undefined` outside any engine-set scope. */
export function getCredentialResolutionContext():
  | CredentialResolutionContext
  | undefined {
  return storage.getStore();
}
