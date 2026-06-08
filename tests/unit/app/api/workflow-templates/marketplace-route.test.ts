/**
 * @jest-environment node
 *
 * GET /api/workflow-templates/marketplace (CS-XT-5A). Mocks auth, the flag, and the service.
 * Proves flag-off dark 404; auth required; authenticated users get public/official summaries;
 * the response carries NO account_id / created_by_user_id (public-safe DTO passthrough).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockFlag = jest.fn();
jest.mock("@/services/workflows/portabilityFlags", () => ({
  isWorkflowTemplatesEnabled: () => mockFlag(),
}));

const mockListMarketplace = jest.fn();
jest.mock("@/services/workflows/templateManagement", () => ({
  listMarketplaceTemplates: (...a: unknown[]) => mockListMarketplace(...a),
}));

import { GET } from "@/app/api/workflow-templates/marketplace/route";

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "u@x.test" } }, error: null });
  mockListMarketplace.mockResolvedValue([
    { id: "tpl-1", name: "Official Starter", description: null, source: "official", isOfficial: true, visibility: "public", creatorDisplayName: "ChainReact", usageCount: 3, forkCount: 1, forkedFromTemplateId: null, publishedAt: "2026-06-01T00:00:00Z", schemaVersion: 1, createdAt: "2026-06-01T00:00:00Z" },
  ]);
});

it("404 when the flag is off (no auth check)", async () => {
  mockFlag.mockReturnValue(false);
  const res = await GET();
  expect(res.status).toBe(404);
  expect(mockGetUser).not.toHaveBeenCalled();
});

it("401 when unauthenticated", async () => {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await GET()).status).toBe(401);
  expect(mockListMarketplace).not.toHaveBeenCalled();
});

it("authenticated user gets official + public summaries", async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.templates).toHaveLength(1);
  expect(body.templates[0].isOfficial).toBe(true);
  expect(body.templates[0].creatorDisplayName).toBe("ChainReact");
});

it("response carries NO account_id / created_by_user_id / definition", async () => {
  const res = await GET();
  const text = await res.text();
  expect(text).not.toMatch(/account_id/);
  expect(text).not.toMatch(/accountId/);
  expect(text).not.toMatch(/created_by_user_id/);
  expect(text).not.toMatch(/createdByUserId/);
  expect(text).not.toMatch(/definition/);
});
