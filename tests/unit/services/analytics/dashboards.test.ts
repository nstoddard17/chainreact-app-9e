/**
 * Dashboard service tests (Slice ANALYTICS-1) — default seeding, including the
 * race-safe path where a concurrent first-load already created the default.
 */

jest.mock("@/repositories/analyticsDashboards", () => ({
  listByAccount: jest.fn(),
  seedDefaultServiceRole: jest.fn(),
  createServiceRole: jest.fn(),
  nextPositionServiceRole: jest.fn(),
}));

import * as repo from "@/repositories/analyticsDashboards";
import { listOrSeedDashboards, DEFAULT_OVERVIEW_WIDGETS } from "@/services/analytics/dashboards";

const mockRepo = repo as jest.Mocked<typeof repo>;

function record(overrides: Partial<repo.AnalyticsDashboardRecord> = {}): repo.AnalyticsDashboardRecord {
  return {
    id: overrides.id ?? "11111111-1111-1111-1111-111111111111",
    accountId: overrides.accountId ?? "acct-1",
    createdByUserId: overrides.createdByUserId ?? "user-1",
    name: overrides.name ?? "Overview",
    position: overrides.position ?? 0,
    isDefault: overrides.isDefault ?? true,
    widgets: overrides.widgets ?? [],
    createdAt: overrides.createdAt ?? "2026-06-17T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-06-17T00:00:00Z",
  };
}

beforeEach(() => jest.clearAllMocks());

describe("listOrSeedDashboards", () => {
  it("returns existing dashboards without seeding", async () => {
    mockRepo.listByAccount.mockResolvedValueOnce([record({ name: "Overview" })]);
    const out = await listOrSeedDashboards("acct-1", "user-1");
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("Overview");
    expect(mockRepo.seedDefaultServiceRole).not.toHaveBeenCalled();
  });

  it("seeds the default 'Overview' board on first access", async () => {
    mockRepo.listByAccount.mockResolvedValueOnce([]);
    mockRepo.seedDefaultServiceRole.mockResolvedValueOnce(
      record({ widgets: DEFAULT_OVERVIEW_WIDGETS }),
    );
    const out = await listOrSeedDashboards("acct-1", "user-1");
    expect(mockRepo.seedDefaultServiceRole).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
    expect(out[0]?.isDefault).toBe(true);
    expect(out[0]?.widgets.length).toBe(DEFAULT_OVERVIEW_WIDGETS.length);
  });

  it("re-lists when it loses the seed race (unique-default conflict → null)", async () => {
    // First list empty → attempt seed → null (someone else won) → re-list returns theirs.
    mockRepo.listByAccount
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([record({ id: "22222222-2222-2222-2222-222222222222" })]);
    mockRepo.seedDefaultServiceRole.mockResolvedValueOnce(null);

    const out = await listOrSeedDashboards("acct-1", "user-1");
    expect(mockRepo.seedDefaultServiceRole).toHaveBeenCalledTimes(1);
    expect(mockRepo.listByAccount).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("22222222-2222-2222-2222-222222222222");
  });
});
