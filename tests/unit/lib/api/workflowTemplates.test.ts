/**
 * @jest-environment node
 *
 * lib/api/workflowTemplates client (CS-XT-7A). Asserts the route paths/methods and that error
 * responses surface as a typed TemplateApiError carrying the server `code`.
 */
import {
  listAccountTemplates,
  updateAccountTemplate,
  deleteAccountTemplate,
  listMarketplaceTemplates,
  useTemplate,
  forkTemplate,
  TemplateApiError,
} from "@/lib/api/workflowTemplates";

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

function ok(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}
function err(status: number, body: unknown) {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

it("listMarketplaceTemplates GETs the marketplace route", async () => {
  fetchMock.mockResolvedValue(ok({ templates: [{ id: "t1" }] }));
  const r = await listMarketplaceTemplates();
  expect(fetchMock).toHaveBeenCalledWith("/api/workflow-templates/marketplace");
  expect(r).toEqual([{ id: "t1" }]);
});

it("listAccountTemplates GETs the account route", async () => {
  fetchMock.mockResolvedValue(ok({ templates: [] }));
  await listAccountTemplates("acct-1");
  expect(fetchMock).toHaveBeenCalledWith("/api/accounts/acct-1/workflow-templates");
});

it("useTemplate POSTs to /use with the target account", async () => {
  fetchMock.mockResolvedValue(ok({ workflowId: "wf-9", name: "T" }));
  const r = await useTemplate("tpl-1", { targetAccountId: "acct-1" });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/workflow-templates/tpl-1/use",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ targetAccountId: "acct-1" }) }),
  );
  expect(r.workflowId).toBe("wf-9");
});

it("forkTemplate POSTs to /fork", async () => {
  fetchMock.mockResolvedValue(ok({ template: { id: "tpl-fork" } }));
  const r = await forkTemplate("tpl-1", { targetAccountId: "acct-1", visibility: "private" });
  expect(fetchMock).toHaveBeenCalledWith("/api/workflow-templates/tpl-1/fork", expect.objectContaining({ method: "POST" }));
  expect(r.template.id).toBe("tpl-fork");
});

it("updateAccountTemplate PATCHes; deleteAccountTemplate DELETEs", async () => {
  fetchMock.mockResolvedValue(ok({ template: { id: "tpl-1", visibility: "public" } }));
  await updateAccountTemplate("acct-1", "tpl-1", { visibility: "public" });
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/accounts/acct-1/workflow-templates/tpl-1",
    expect.objectContaining({ method: "PATCH" }),
  );
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);
  await deleteAccountTemplate("acct-1", "tpl-1");
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/accounts/acct-1/workflow-templates/tpl-1",
    expect.objectContaining({ method: "DELETE" }),
  );
});

it("surfaces a typed TemplateApiError carrying the server code (tier/limit)", async () => {
  fetchMock.mockResolvedValue(err(403, { error: "Upgrade", code: "TEMPLATES_REQUIRE_UPGRADE" }));
  await expect(forkTemplate("tpl-1", { targetAccountId: "a" })).rejects.toMatchObject({
    name: "TemplateApiError",
    code: "TEMPLATES_REQUIRE_UPGRADE",
    status: 403,
  });
});

it("falls back to HTTP_<status> when the error body has no code", async () => {
  fetchMock.mockResolvedValue(err(500, {}));
  await expect(useTemplate("t", { targetAccountId: "a" })).rejects.toMatchObject({ code: "HTTP_500" });
  expect(TemplateApiError).toBeDefined();
});
