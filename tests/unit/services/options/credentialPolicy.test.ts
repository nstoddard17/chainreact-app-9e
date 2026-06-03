/**
 * @jest-environment node
 *
 * Tests for services/options/credentialPolicy.ts — the pure builder/AI options
 * credential-sharing decision (Slice 4.ACCOUNT-MODEL-22D-2).
 *
 * Drives the real `credentialSharingForProvider` classifier (slack=account,
 * gmail=personal, unknown=personal default) so the decision matrix is pinned
 * end-to-end.
 */

import { decideOptionsCredential } from "@/services/options/credentialPolicy";
import type { WorkflowCreatorContext } from "@/services/options/types";

const creator: WorkflowCreatorContext = {
  workflowId: "wf-9",
  createdByUserId: "creator-1",
  accountId: "acct-team",
};

describe("decideOptionsCredential", () => {
  it("returns legacy when there is no workflow context", () => {
    expect(decideOptionsCredential("gmail", "user-1", null)).toEqual({
      kind: "legacy",
    });
    // Provider class is irrelevant without a workflow context.
    expect(decideOptionsCredential("slack", "user-1", null)).toEqual({
      kind: "legacy",
    });
  });

  it("returns account scope for an account/service provider (no pin), regardless of requester", () => {
    // Requester is NOT the creator — account providers are shared anyway.
    expect(decideOptionsCredential("slack", "someone-else", creator)).toEqual({
      kind: "account",
      accountId: "acct-team",
    });
  });

  it("pins a personal provider to the creator when the requester IS the creator", () => {
    expect(decideOptionsCredential("gmail", "creator-1", creator)).toEqual({
      kind: "personal-creator",
      accountId: "acct-team",
      connectedByUserId: "creator-1",
    });
  });

  it("gates a personal provider to not-owner when the requester is NOT the creator", () => {
    expect(decideOptionsCredential("gmail", "user-2", creator)).toEqual({
      kind: "not-owner",
      provider: "gmail",
    });
  });

  it("treats an unknown provider as personal (creator-gated, never silently shared)", () => {
    // Non-creator → not-owner (would have been `account` if misclassified).
    expect(decideOptionsCredential("totally-unknown", "user-2", creator)).toEqual({
      kind: "not-owner",
      provider: "totally-unknown",
    });
    // Creator → pinned.
    expect(decideOptionsCredential("totally-unknown", "creator-1", creator)).toEqual({
      kind: "personal-creator",
      accountId: "acct-team",
      connectedByUserId: "creator-1",
    });
  });
});
