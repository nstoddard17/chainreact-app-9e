/**
 * Slice 3.MAILCHIMP-2 integration test — audience → segment cascade
 * (`mailchimp:audiences` → `mailchimp:segments`).
 *
 * Mirrors the Slice 3.HUBSPOT-2 + Slice 3.GSHEETS-2 cascade integration
 * tests — same SchemaForm-with-synthetic-fields harness, same three
 * scenarios (happy path, gated-when-empty, change-clears-dependent).
 * The synthetic fields use the live Mailchimp resolver source keys; the
 * `@/lib/api/options` typed client is mocked so the test owns what the
 * picker sees without a real HTTP round-trip.
 *
 * Field-name choice — `listId` matches the two existing consumer
 * trigger schemas (segment_updated, subscriber_added_to_segment) which
 * both use `listId` as the parent and `segmentId` as the child. The
 * `mailchimp:segments` resolver declares `requiredDeps: ["listId"]`
 * accordingly. Future actions that use `audience_id` instead would
 * need either a schema rename or a sibling resolver — out of scope
 * here; see resolver header for the variance discussion.
 *
 * Scope:
 *   - Two synthetic combobox fields (`listId` + `segmentId`) wired to
 *     the Mailchimp resolver source keys via the GSHEETS-2 cascade
 *     infrastructure (`dependsOn` clear-on-parent-change + child
 *     fetch-with-deps).
 *   - Action / trigger metas come in MAILCHIMP-3 / MAILCHIMP-4; this
 *     test owns the cascade infrastructure exercise, not the meta
 *     surface.
 *
 * Out of scope (covered separately):
 *   - Resolver server-side logic — covered by
 *     `tests/unit/integrations/mailchimp/options/*.test.ts`.
 *   - The Mailchimp `segmentsList` API wrapper — covered by
 *     `tests/unit/integrations/_shared/mailchimp/api/segments.test.ts`.
 *   - Full WorkflowBuilder shell exercising real Mailchimp metas —
 *     covered by the MAILCHIMP-3 / MAILCHIMP-4 integration tests.
 */

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import * as React from "react";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";
import { pickComboboxOption } from "./helpers/comboboxField";

// Synthetic field set mirroring what `segment_updated.meta.ts` /
// `subscriber_added_to_segment.meta.ts` will declare in MAILCHIMP-4:
// listId combobox + segmentId combobox with dependsOn listId.
const fields: readonly FieldMeta[] = [
  {
    name: "listId",
    label: "Audience",
    description: "Pick a Mailchimp audience.",
    type: "combobox",
    required: true,
    optionsSource: "mailchimp:audiences",
  } as FieldMeta,
  {
    name: "segmentId",
    label: "Segment",
    description: "Pick a segment inside the chosen audience.",
    type: "combobox",
    required: true,
    dependsOn: "listId",
    optionsSource: "mailchimp:segments",
  } as FieldMeta,
];

function CascadeHost(props: {
  onSave: (values: Record<string, string>) => void;
}): React.ReactElement {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave(values);
      }}
    >
      <SchemaForm
        fields={fields}
        values={values}
        onChange={(name, value) => {
          setValues((prev) => {
            const next = { ...prev };
            if (value === undefined || value === null || value === "") {
              delete next[name];
            } else {
              next[name] = String(value);
            }
            return next;
          });
        }}
      />
      <button type="submit">Save</button>
    </form>
  );
}

function audiencesResponse(
  items: ReadonlyArray<{ value: string; label: string; description?: string }>,
) {
  return {
    ok: true as const,
    source: "mailchimp:audiences",
    items,
    hasMore: false,
  };
}

function segmentsResponse(
  items: ReadonlyArray<{ value: string; label: string; description?: string }>,
) {
  return {
    ok: true as const,
    source: "mailchimp:segments",
    items,
    hasMore: false,
  };
}

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
});

describe("mailchimp audience → segment cascade — two-hop happy path", () => {
  it("loads audiences, then loads segments scoped to the chosen audience, then saves both values", async () => {
    mockFetchOptionsSource.mockImplementation((source: string) => {
      if (source === "mailchimp:audiences") {
        return Promise.resolve(
          audiencesResponse([
            { value: "list-1", label: "Acme Newsletter", description: "42 members" },
            { value: "list-2", label: "Beta Channel", description: "7 members" },
          ]),
        );
      }
      if (source === "mailchimp:segments") {
        return Promise.resolve(
          segmentsResponse([
            { value: "11", label: "VIPs", description: "saved · 42 members" },
            { value: "22", label: "Recent signups", description: "static · 7 members" },
          ]),
        );
      }
      return Promise.resolve({
        ok: false,
        source,
        code: "UNKNOWN",
        message: "test mock: unknown source",
      });
    });

    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<CascadeHost onSave={onSave} />);

    // 1. Audience picker: opens, fetches, user selects.
    await pickComboboxOption(user, /audience/i, "Acme Newsletter");

    await waitFor(() => {
      const audienceCalls = mockFetchOptionsSource.mock.calls.filter(
        (c) => c[0] === "mailchimp:audiences",
      );
      expect(audienceCalls.length).toBeGreaterThan(0);
    });

    // 2. Segment picker should now fetch scoped to the chosen audience.
    await waitFor(() => {
      const segmentCalls = mockFetchOptionsSource.mock.calls.filter(
        (c) => c[0] === "mailchimp:segments",
      );
      expect(segmentCalls.length).toBeGreaterThan(0);
      const lastCall = segmentCalls[segmentCalls.length - 1]!;
      const args = lastCall[1] as { deps?: Record<string, string> } | undefined;
      // dependsOn: "listId" — the cascade passes the parent value as
      // deps.listId.
      expect(args?.deps?.listId).toBe("list-1");
    });

    // 3. Segment picker: pick a segment.
    await pickComboboxOption(user, /segment/i, "VIPs");

    // 4. Save and inspect captured values.
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith({
      listId: "list-1",
      segmentId: "11",
    });
  });
});

describe("mailchimp audience → segment cascade — segment picker is gated until audience is set", () => {
  it("does NOT fetch mailchimp:segments while listId is empty (Slice 3.33 cascade gate)", async () => {
    mockFetchOptionsSource.mockImplementation((source: string) => {
      if (source === "mailchimp:audiences") {
        return Promise.resolve(audiencesResponse([]));
      }
      return Promise.resolve({
        ok: false,
        source,
        code: "UNKNOWN",
        message: "test mock: should not be called",
      });
    });

    render(<CascadeHost onSave={jest.fn()} />);

    await waitFor(() => {
      expect(mockFetchOptionsSource).toHaveBeenCalledWith(
        "mailchimp:audiences",
        expect.anything(),
      );
    });

    const segmentCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "mailchimp:segments",
    );
    expect(segmentCalls).toEqual([]);

    // The segment field renders the passive "Select Audience first"
    // trigger from the Slice 3.33 cascade UX.
    expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();
  });
});

describe("mailchimp audience → segment cascade — changing audience clears the dependent segment", () => {
  it("switching audience clears the stale segmentId and re-fetches segments for the new audience", async () => {
    let segmentCallCount = 0;
    mockFetchOptionsSource.mockImplementation(
      (source: string, args?: { deps?: Record<string, string> }) => {
        if (source === "mailchimp:audiences") {
          return Promise.resolve(
            audiencesResponse([
              { value: "list-1", label: "Acme Newsletter" },
              { value: "list-2", label: "Beta Channel" },
            ]),
          );
        }
        if (source === "mailchimp:segments") {
          segmentCallCount += 1;
          const id = args?.deps?.listId;
          if (id === "list-1") {
            return Promise.resolve(
              segmentsResponse([
                { value: "11", label: "Acme VIPs" },
              ]),
            );
          }
          if (id === "list-2") {
            return Promise.resolve(
              segmentsResponse([
                { value: "99", label: "Beta Early Adopters" },
              ]),
            );
          }
        }
        return Promise.resolve({
          ok: false,
          source,
          code: "UNKNOWN",
          message: "test mock: unknown",
        });
      },
    );

    const onSave = jest.fn();
    const user = userEvent.setup();
    render(<CascadeHost onSave={onSave} />);

    // Pick audience A → its segment.
    await pickComboboxOption(user, /audience/i, "Acme Newsletter");
    await pickComboboxOption(user, /segment/i, "Acme VIPs");

    // Switch to audience B. The Slice 3.33 cascade should:
    //   - clear segmentId from the values bag (so the new fetch isn't
    //     polluted by the stale Acme-VIPs id)
    //   - re-fetch mailchimp:segments with deps.listId = list-2
    await pickComboboxOption(user, /audience/i, "Beta Channel");

    await waitFor(() => {
      const segmentCalls = mockFetchOptionsSource.mock.calls.filter(
        (c) => c[0] === "mailchimp:segments",
      );
      const last = segmentCalls[segmentCalls.length - 1]!;
      const args = last[1] as { deps?: Record<string, string> } | undefined;
      expect(args?.deps?.listId).toBe("list-2");
    });

    expect(segmentCallCount).toBeGreaterThanOrEqual(2);

    // Pick the new segment and save. segmentId MUST be the Beta segment,
    // not the stale Acme-VIPs id (the cascade clear enforces this).
    await pickComboboxOption(user, /segment/i, "Beta Early Adopters");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith({
      listId: "list-2",
      segmentId: "99",
    });
  });
});
