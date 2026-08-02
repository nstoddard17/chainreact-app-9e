/** @jest-environment node */
import {
  getRunForMobileDetailServiceRole,
  listPageByAccountForMobileServiceRole,
} from "@/repositories/mobile/workflowRuns";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(),
}));

/**
 * The mobile run readers' row boundary IS a no-leak boundary: raw payload
 * columns are never selected, and persisted step `output` / error `details`
 * are dropped before any service sees the row — including a TEST run's
 * author-visible output (mobile is stricter than web by design).
 */
describe("repositories/workflowRunsMobile — row-boundary redaction", () => {
  const selectSpy = jest.fn();

  function clientReturning(row: unknown) {
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    selectSpy.mockReturnValue({ eq });
    return { from: jest.fn().mockReturnValue({ select: selectSpy }) };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("detail: never selects trigger_event or fatal_error; strips step output/details (even on a test run)", async () => {
    (getServiceRoleClient as jest.Mock).mockReturnValue(
      clientReturning({
        id: "00000000-0000-4000-8000-0000000000c2",
        workflow_id: "00000000-0000-4000-8000-0000000000b1",
        account_id: "00000000-0000-4000-8000-0000000000a2",
        status: "failed",
        is_test: true,
        triggered_by: "test",
        started_at: "2026-07-31T10:05:00.000Z",
        finished_at: "2026-07-31T10:05:04.000Z",
        error_classification: null,
        steps: [
          {
            nodeId: "node-2",
            status: "failed",
            output: { secret: "SECRET-STEP-OUTPUT" },
            error: {
              code: "HANDLER_FAILED",
              message: "failed",
              details: { providerBody: "SECRET-PROVIDER-ERROR-BODY" },
            },
          },
          { nodeId: "node-3", status: "skipped" },
          "garbage-non-object-step",
        ],
      }),
    );

    const record = await getRunForMobileDetailServiceRole(
      "00000000-0000-4000-8000-0000000000c2",
    );

    const selected = selectSpy.mock.calls[0][0] as string;
    expect(selected).not.toContain("trigger_event");
    expect(selected).not.toContain("fatal_error");
    expect(selected).toContain("steps");

    expect(record?.steps).toEqual([
      {
        nodeId: "node-2",
        status: "failed",
        error: { code: "HANDLER_FAILED", message: "failed" },
      },
      { nodeId: "node-3", status: "skipped", error: null },
    ]);
    expect(JSON.stringify(record)).not.toContain("SECRET-STEP-OUTPUT");
    expect(JSON.stringify(record)).not.toContain("SECRET-PROVIDER-ERROR-BODY");
  });

  it("list: selects the narrow display columns only", async () => {
    const limit = jest.fn().mockResolvedValue({ data: [], error: null });
    const order2 = jest.fn().mockReturnValue({ limit });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    const eq = jest.fn().mockReturnValue({ order: order1 });
    selectSpy.mockReturnValue({ eq });
    (getServiceRoleClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({ select: selectSpy }),
    });

    await listPageByAccountForMobileServiceRole("00000000-0000-4000-8000-0000000000a2", {
      limit: 26,
    });
    const selected = selectSpy.mock.calls[0][0] as string;
    for (const banned of ["trigger_event", "fatal_error", "steps", "*"]) {
      expect(selected).not.toContain(banned);
    }
  });
});
