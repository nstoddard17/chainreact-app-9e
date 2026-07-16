/**
 * @jest-environment node
 *
 * RESOLVERS-1 — GitHub meta pins for the branch-picker fields.
 *
 * Pins:
 *   - `create_pull_request.head` / `.base`, `create_branch.sourceBranch`,
 *     and the `new_commit` trigger's `branch` filter are `github:branches`
 *     comboboxes with `allowManualEntry: true` and `dependsOn: "repository"`
 *     (the value stays the raw branch-name string; cross-repo
 *     `fork-owner:branch` heads and `{{...}}` wiring keep working),
 *   - `create_branch.branchName` stays free text (it's a NEW branch name —
 *     never a pick-from-list),
 *   - `create_issue.milestone` stays a `number` field with NO optionsSource:
 *     the runtime schema stores `z.number()`, a combobox commits a string,
 *     and the ActionMeta contract forbids `optionsSource` on `number`
 *     fields — documented RESOLVERS-1 skip.
 */
import { createPullRequestMeta } from "@/integrations/github/actions/createPullRequest.meta";
import { createBranchMeta } from "@/integrations/github/actions/createBranch.meta";
import { createIssueMeta } from "@/integrations/github/actions/createIssue.meta";
import { newCommitTriggerMeta } from "@/integrations/github/triggers/newCommit/newCommit.meta";
import type { FieldMeta } from "@/contracts/actionMeta";

function field(
  meta: { key: string; fields: ReadonlyArray<FieldMeta> },
  name: string,
): FieldMeta {
  const f = meta.fields.find((x) => x.name === name);
  if (!f) throw new Error(`${meta.key} has no field '${name}'`);
  return f;
}

describe("github branch fields — github:branches combobox + manual entry", () => {
  const BRANCH_PICKER_FIELDS = [
    [createPullRequestMeta.key, "head", createPullRequestMeta, true],
    [createPullRequestMeta.key, "base", createPullRequestMeta, false],
    [createBranchMeta.key, "sourceBranch", createBranchMeta, false],
    [newCommitTriggerMeta.key, "branch", newCommitTriggerMeta, false],
  ] as const;

  it.each(BRANCH_PICKER_FIELDS)(
    "%s.%s is a github:branches combobox (dependsOn repository, manual entry)",
    (_key, name, meta, required) => {
      const f = field(meta, name);
      expect(f.type).toBe("combobox");
      expect(f.optionsSource).toBe("github:branches");
      expect(f.dependsOn).toBe("repository");
      expect(f.allowManualEntry).toBe(true);
      expect(f.required).toBe(required);
      // Static options never coexist with the resolver.
      expect(f.options).toBeUndefined();
    },
  );

  it("create_branch.branchName stays free text (new branch name, not a pick)", () => {
    const f = field(createBranchMeta, "branchName");
    expect(f.type).toBe("text");
    expect(f.optionsSource).toBeUndefined();
  });
});

describe("github create_issue.milestone — documented RESOLVERS-1 skip", () => {
  it("stays a number field with no optionsSource (schema stores z.number(); combobox would commit a string)", () => {
    const f = field(createIssueMeta, "milestone");
    expect(f.type).toBe("number");
    expect(f.optionsSource).toBeUndefined();
    expect(f.numeric).toEqual({ min: 1, integer: true, step: 1 });
  });
});
