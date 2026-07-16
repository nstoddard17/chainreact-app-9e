/**
 * @jest-environment node
 *
 * Config-UX sweep — Asana `list_tasks_in_project` Advanced-tab placement.
 * Pagination plumbing (cursor + page size) moves out of the normal setup
 * path; the workspace → project cascade stays in Setup.
 */
import { asanaListTasksInProjectMeta } from "@/integrations/asana/actions/tasks/listTasksInProject.meta";

const byName = new Map(
  asanaListTasksInProjectMeta.fields.map((f) => [f.name, f]),
);

describe("asana:list_tasks_in_project — advanced-tab placement", () => {
  it("offset (pagination cursor) is advanced", () => {
    expect(byName.get("offset")!.advanced).toBe(true);
    expect(byName.get("offset")!.required).toBe(false);
  });

  it("pageSize is advanced", () => {
    expect(byName.get("pageSize")!.advanced).toBe(true);
    expect(byName.get("pageSize")!.required).toBe(false);
  });

  it("workspace/project pickers stay in the normal setup path", () => {
    expect(byName.get("workspaceId")!.advanced).not.toBe(true);
    expect(byName.get("projectId")!.advanced).not.toBe(true);
  });
});
