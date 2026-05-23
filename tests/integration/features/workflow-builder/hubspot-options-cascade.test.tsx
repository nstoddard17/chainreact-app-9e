/**
 * Slice 3.HUBSPOT-2 integration test — pipeline → stage cascade
 * (`hubspot:deal_pipelines` → `hubspot:deal_stages`).
 *
 * Mirrors the Slice 3.GSHEETS-2 cascade integration test exactly —
 * same SchemaForm-with-synthetic-fields harness, same three scenarios
 * (happy path, gated-when-empty, change-clears-dependent). The
 * synthetic fields use the live HubSpot resolver source keys; the
 * `@/lib/api/options` typed client is mocked so the test owns what the
 * picker sees without a real HTTP round-trip.
 *
 * Scope:
 *   - Two synthetic combobox fields (`pipeline` + `dealstage`) wired to
 *     the HubSpot resolver source keys via the GSHEETS-2 cascade
 *     infrastructure (`dependsOn` clear-on-parent-change + child
 *     fetch-with-deps).
 *   - Action metas come in HUBSPOT-4; this test owns the cascade
 *     infrastructure exercise, not the meta surface.
 *
 * Out of scope (covered separately):
 *   - Resolver server-side logic — covered by
 *     `tests/unit/integrations/hubspot/options/*.test.ts`.
 *   - The HubSpot Pipelines API wrapper — covered by
 *     `tests/unit/integrations/_shared/hubspot/api/pipelines.test.ts`.
 *   - Full WorkflowBuilder shell exercising real HubSpot metas —
 *     covered by the HUBSPOT-4 integration tests.
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

// Synthetic field set mirroring what `create_deal.meta.ts` will
// declare in HUBSPOT-4: pipeline combobox + dealstage combobox with
// dependsOn pipeline.
const fields: readonly FieldMeta[] = [
  {
    name: "pipeline",
    label: "Pipeline",
    description: "Pick a HubSpot deal pipeline.",
    type: "combobox",
    required: true,
    optionsSource: "hubspot:deal_pipelines",
  } as FieldMeta,
  {
    name: "dealstage",
    label: "Deal stage",
    description: "Pick a stage inside the chosen pipeline.",
    type: "combobox",
    required: true,
    dependsOn: "pipeline",
    optionsSource: "hubspot:deal_stages",
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

function pipelinesResponse(items: ReadonlyArray<{ value: string; label: string }>) {
  return {
    ok: true as const,
    source: "hubspot:deal_pipelines",
    items,
    hasMore: false,
  };
}

function stagesResponse(items: ReadonlyArray<{ value: string; label: string }>) {
  return {
    ok: true as const,
    source: "hubspot:deal_stages",
    items,
    hasMore: false,
  };
}

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
});

describe("hubspot pipeline → stage cascade — two-hop happy path", () => {
  it("loads pipelines, then loads stages scoped to the chosen pipeline, then saves both values", async () => {
    mockFetchOptionsSource.mockImplementation((source: string) => {
      if (source === "hubspot:deal_pipelines") {
        return Promise.resolve(
          pipelinesResponse([
            { value: "default", label: "Sales Pipeline" },
            { value: "enterprise", label: "Enterprise Pipeline" },
          ]),
        );
      }
      if (source === "hubspot:deal_stages") {
        return Promise.resolve(
          stagesResponse([
            { value: "appointmentscheduled", label: "Appointment Scheduled" },
            { value: "closedwon", label: "Closed Won" },
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

    // 1. Pipeline picker: opens, fetches, user selects.
    await pickComboboxOption(user, /pipeline/i, "Sales Pipeline");

    await waitFor(() => {
      const pipelineCalls = mockFetchOptionsSource.mock.calls.filter(
        (c) => c[0] === "hubspot:deal_pipelines",
      );
      expect(pipelineCalls.length).toBeGreaterThan(0);
    });

    // 2. Stage picker should now fetch scoped to the chosen pipeline.
    await waitFor(() => {
      const stageCalls = mockFetchOptionsSource.mock.calls.filter(
        (c) => c[0] === "hubspot:deal_stages",
      );
      expect(stageCalls.length).toBeGreaterThan(0);
      const lastCall = stageCalls[stageCalls.length - 1]!;
      const args = lastCall[1] as { deps?: Record<string, string> } | undefined;
      // dependsOn: "pipeline" — the cascade passes the parent value as
      // deps.pipeline.
      expect(args?.deps?.pipeline).toBe("default");
    });

    // 3. Stage picker: pick a stage.
    await pickComboboxOption(user, /deal stage/i, "Closed Won");

    // 4. Save and inspect captured values.
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith({
      pipeline: "default",
      dealstage: "closedwon",
    });
  });
});

describe("hubspot pipeline → stage cascade — stage picker is gated until pipeline is set", () => {
  it("does NOT fetch hubspot:deal_stages while pipeline is empty (Slice 3.33 cascade gate)", async () => {
    mockFetchOptionsSource.mockImplementation((source: string) => {
      if (source === "hubspot:deal_pipelines") {
        return Promise.resolve(pipelinesResponse([]));
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
        "hubspot:deal_pipelines",
        expect.anything(),
      );
    });

    const stageCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "hubspot:deal_stages",
    );
    expect(stageCalls).toEqual([]);

    // The stage field renders the passive "Select Pipeline first"
    // trigger from the Slice 3.33 cascade UX.
    expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();
  });
});

describe("hubspot pipeline → stage cascade — changing pipeline clears the dependent stage", () => {
  it("switching pipeline clears the stale dealstage and re-fetches stages for the new pipeline", async () => {
    let stageCallCount = 0;
    mockFetchOptionsSource.mockImplementation(
      (source: string, args?: { deps?: Record<string, string> }) => {
        if (source === "hubspot:deal_pipelines") {
          return Promise.resolve(
            pipelinesResponse([
              { value: "default", label: "Sales Pipeline" },
              { value: "enterprise", label: "Enterprise Pipeline" },
            ]),
          );
        }
        if (source === "hubspot:deal_stages") {
          stageCallCount += 1;
          const id = args?.deps?.pipeline;
          if (id === "default") {
            return Promise.resolve(
              stagesResponse([
                { value: "default-stage1", label: "Sales Stage 1" },
              ]),
            );
          }
          if (id === "enterprise") {
            return Promise.resolve(
              stagesResponse([
                { value: "ent-stage1", label: "Enterprise Stage 1" },
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

    // Pick pipeline A → its stage.
    await pickComboboxOption(user, /pipeline/i, "Sales Pipeline");
    await pickComboboxOption(user, /deal stage/i, "Sales Stage 1");

    // Switch to pipeline B. The Slice 3.33 cascade should:
    //   - clear dealstage from the values bag (so the new fetch isn't
    //     polluted by the stale Sales-Stage-1)
    //   - re-fetch hubspot:deal_stages with deps.pipeline = enterprise
    await pickComboboxOption(user, /pipeline/i, "Enterprise Pipeline");

    await waitFor(() => {
      const stageCalls = mockFetchOptionsSource.mock.calls.filter(
        (c) => c[0] === "hubspot:deal_stages",
      );
      const last = stageCalls[stageCalls.length - 1]!;
      const args = last[1] as { deps?: Record<string, string> } | undefined;
      expect(args?.deps?.pipeline).toBe("enterprise");
    });

    expect(stageCallCount).toBeGreaterThanOrEqual(2);

    // Pick the new stage and save. dealstage MUST be the enterprise
    // stage, not the stale Sales-Stage-1 (the cascade clear enforces
    // this).
    await pickComboboxOption(user, /deal stage/i, "Enterprise Stage 1");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith({
      pipeline: "enterprise",
      dealstage: "ent-stage1",
    });
  });
});
