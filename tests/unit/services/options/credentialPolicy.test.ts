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

  describe("CS-4 — accepted per-node credential owner override", () => {
    it("pins a personal provider to the ASSIGNED OWNER when the requester IS the owner", () => {
      expect(decideOptionsCredential("gmail", "owner-B", creator, "owner-B")).toEqual({
        kind: "personal-creator",
        accountId: "acct-team",
        connectedByUserId: "owner-B",
      });
    });

    it("gates the CREATOR to not-owner once a different member owns the node", () => {
      // The creator is no longer the effective owner for this node.
      expect(decideOptionsCredential("gmail", "creator-1", creator, "owner-B")).toEqual({
        kind: "not-owner",
        provider: "gmail",
      });
    });

    it("a third member is still not-owner", () => {
      expect(decideOptionsCredential("gmail", "user-3", creator, "owner-B")).toEqual({
        kind: "not-owner",
        provider: "gmail",
      });
    });

    it("null/undefined effective owner falls back to creator-pinned (today's behavior)", () => {
      expect(decideOptionsCredential("gmail", "creator-1", creator, null)).toEqual({
        kind: "personal-creator",
        accountId: "acct-team",
        connectedByUserId: "creator-1",
      });
      expect(decideOptionsCredential("gmail", "creator-1", creator, undefined)).toEqual({
        kind: "personal-creator",
        accountId: "acct-team",
        connectedByUserId: "creator-1",
      });
    });

    it("account/service providers ignore the node owner entirely (stay account-shared)", () => {
      expect(decideOptionsCredential("slack", "owner-B", creator, "owner-B")).toEqual({
        kind: "account",
        accountId: "acct-team",
      });
      // Even a non-owner requester is account-shared for slack.
      expect(decideOptionsCredential("slack", "user-3", creator, "owner-B")).toEqual({
        kind: "account",
        accountId: "acct-team",
      });
    });
  });
});
