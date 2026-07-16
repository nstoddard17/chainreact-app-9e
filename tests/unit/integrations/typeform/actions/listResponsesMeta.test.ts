/**
 * @jest-environment node
 *
 * Config-UX sweep — Typeform `list_responses` Advanced-tab placement.
 * Pagination plumbing (`before` cursor + page size) moves out of the
 * normal setup path; the form picker and date/search filters stay in
 * Setup.
 */
import { typeformListResponsesMeta } from "@/integrations/typeform/actions/listResponses.meta";

const byName = new Map(typeformListResponsesMeta.fields.map((f) => [f.name, f]));

describe("typeform:list_responses — advanced-tab placement", () => {
  it("before (pagination cursor) is advanced", () => {
    expect(byName.get("before")!.advanced).toBe(true);
    expect(byName.get("before")!.required).toBe(false);
  });

  it("pageSize is advanced", () => {
    expect(byName.get("pageSize")!.advanced).toBe(true);
    expect(byName.get("pageSize")!.required).toBe(false);
  });

  it("formId picker and since/until/query filters stay in the normal setup path", () => {
    for (const name of ["formId", "since", "until", "query"]) {
      expect(byName.get(name)!.advanced).not.toBe(true);
    }
  });
});
