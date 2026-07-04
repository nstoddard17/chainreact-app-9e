/**
 * Certification seed — github.
 *
 * Write batch certified 2026-07-04 live on the connected account, using ONLY
 * self-owned crsmoke resources. GitHub registers NO read actions, so every verify
 * runs through the github per-resource state seams (repo / issue / issue-comments /
 * branch-ref / pull-request / gist GETs). CONTAINMENT: create_repository +
 * create_gist stand alone; issue / comment / branch / pull-request target ONE
 * dev-test-staged shared crsmoke repo (never a discovered repo). No registered
 * delete/close action exists and the granted token has no delete_repo scope, so
 * every created object is an honest left artifact.
 *
 * SAFETY: safe facts only — no secrets, tokens, selector values, ids, payloads,
 * or PII (guarded by certification.test.ts).
 */
import type { CertificationRecord } from "../certification";
import { records } from "./_shared";

const SMOKE_WRITE_GITHUB = "2026-07-04";

export const GITHUB_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create (marker name, private, auto_init) + repo_state read-back proves the persisted name; marked private repo stays (no delete_repo scope)", SMOKE_WRITE_GITHUB, [
    ["github", "create_repository"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live open (marker title/body on the staged shared repo) + issue_state read-back proves the persisted title; marked issue stays (no registered close/delete)", SMOKE_WRITE_GITHUB, [
    ["github", "create_issue"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live comment on a seeded smoke issue + issue_comments read-back proves the marker in the persisted comments list; marked comment stays (no registered delete)", SMOKE_WRITE_GITHUB, [
    ["github", "add_comment"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live branch off the staged shared repo default branch + branch_state read-back proves the persisted ref marker; marked branch stays (no registered delete)", SMOKE_WRITE_GITHUB, [
    ["github", "create_branch"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live PR from the staged head branch (real diff) to the auto-detected base + pull_request_state read-back proves the title; marked open PR stays (no close)", SMOKE_WRITE_GITHUB, [
    ["github", "create_pull_request"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create (marker filename/description, SECRET) + gist_state read-back proves the persisted description; marked secret gist stays (no registered delete-gist)", SMOKE_WRITE_GITHUB, [
    ["github", "create_gist"],
  ]),
];
