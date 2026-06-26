/**
 * Write smoke harness deps — Microsoft OneNote section discovery + page existence.
 *
 * OneNote pages are created INSIDE a section (the section is the borrowed container,
 * like a Trello list / Notion parent page); the smoke-owned resource is the PAGE,
 * created + hard-deleted by the run. Two helpers:
 *
 *   - `discoverOneNoteSmokeSection` — finds a SAFE write target. Like the Trello
 *     board/list guard, it ONLY returns a section whose section name OR its notebook
 *     name contains "smoke"/"test" (case-insensitive). This guarantees the harness
 *     never creates pages in the user's REAL notebook — absent a smoke/test-named
 *     section it returns null and the fixture reports BLOCKED_ENV (no safe target).
 *   - `onenoteSmokeReadBack` — a delete-verification probe for `delete_page`: a typed
 *     NotFoundError maps to `exists:false`; any other error RE-THROWS (a permission/
 *     API failure can never read as "deleted").
 *
 * SAFETY (seam-refresh-guard invariants — see context.ts): every provider HTTP call
 * runs inside a `refreshAndRetry` apiCall lambda; output is bounded + sanitized (ids
 * + names for discovery, `exists`/`title` for the probe — never page BODY content).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { notebooksList } from "@/integrations/microsoft-onenote/api/notebooksList";
import { sectionsList } from "@/integrations/microsoft-onenote/api/sectionsList";
import { pagesGet } from "@/integrations/microsoft-onenote/api/pagesGet";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

const SMOKE_NAME = /smoke|test/i;

export interface OneNoteSmokeSection {
  readonly sectionId: string;
  /** The parent notebook id — the create_page/update_page meta requires it as a
   *  UI-scope cascade parent (`notebookId` -> `sectionId`), so the readiness gate
   *  rejects a config without it even though the handler ignores it. */
  readonly notebookId: string;
  readonly notebookLabel: string;
  readonly sectionLabel: string;
}

/**
 * Discover a SAFE smoke write-target section: a section whose own name OR its
 * notebook's name is explicitly smoke/test-named. Returns the FIRST match, or null
 * when none exists (-> the fixture is BLOCKED_ENV, never a write into a real
 * notebook). Bounded: scans at most the first 25 notebooks × first 25 sections.
 */
export async function discoverOneNoteSmokeSection(
  accountId: string,
  userId: string,
): Promise<OneNoteSmokeSection | null> {
  const integration = await getActiveForExecution(accountId, "microsoft-onenote", null, {
    connectedByUserId: userId,
  });
  if (!integration) return null;

  const { notebooks } = await refreshAndRetry({
    accountId,
    provider: "microsoft-onenote",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) => notebooksList({ accessToken, top: 25 }),
  });

  for (const nb of notebooks) {
    const notebookLabel = nb.displayName ?? "";
    const notebookIsSmoke = SMOKE_NAME.test(notebookLabel);
    const { sections } = await refreshAndRetry({
      accountId,
      provider: "microsoft-onenote",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => sectionsList({ accessToken, notebookId: nb.id, top: 25 }),
    });
    for (const sec of sections) {
      const sectionLabel = sec.displayName ?? "";
      // Safe target = the section itself OR its notebook is smoke/test-named.
      if (notebookIsSmoke || SMOKE_NAME.test(sectionLabel)) {
        return { sectionId: sec.id, notebookId: nb.id, notebookLabel, sectionLabel };
      }
    }
  }
  return null;
}

/**
 * Smoke read-back: `microsoft-onenote:page_metadata` — delete-verification existence
 * probe. Returns null for any other (provider, action).
 */
export async function onenoteSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "microsoft-onenote" || input.action !== "page_metadata") return null;

  const integration = await getActiveForExecution(ctx.accountId, "microsoft-onenote", null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) return { ok: false, output: null, reason: "microsoft-onenote not connected" };

  const pageId = input.config.pageId;
  if (typeof pageId !== "string" || pageId.length === 0) {
    return { ok: false, output: null, reason: "page_metadata read-back: missing pageId" };
  }

  // A deleted page returns Graph 404 -> typed NotFoundError -> exists:false. ANY other
  // error re-throws to the composer's outer catch -> honest VERIFY_FAILED.
  try {
    const page = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "microsoft-onenote",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => pagesGet({ accessToken, pageId }),
    });
    // Bounded + sanitized: existence + the title only (NEVER the page body content).
    return { ok: true, output: { exists: true, title: page.title ?? null }, reason: null };
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { ok: true, output: { exists: false }, reason: null };
    }
    throw err;
  }
}
