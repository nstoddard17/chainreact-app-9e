/**
 * AI-PROVIDER-6 (CS-6) — the Transform Data config panel, rendered from the
 * REAL action metadata.
 *
 * User behavior: point the step at some data, say where it is headed, and the
 * fields come from there. Choosing the other mode swaps the whole question —
 * and never leaves the previous answer behind to trip a runtime refinement.
 */
const mockUseOptionsSource = jest.fn();

jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...args: unknown[]) => mockUseOptionsSource(...args),
}));

import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";
import { deriveDefaultConfig } from "@/features/workflow-builder/state/graphSlice";
import { selectFieldOption } from "@/tests/integration/features/workflow-builder/helpers/selectField";
import { transformDataMeta } from "@/integrations/ai/actions/transformData.meta";

const FIELDS = transformDataMeta.fields;

const DESTINATIONS = [
  {
    value: "microsoft-outlook:send_email",
    label: "Microsoft Outlook — Send Email",
    description: "4 fields can be filled automatically.",
  },
  {
    value: "trello:create_card",
    label: "Trello — Create Card",
    description: "5 fields can be filled automatically.",
  },
];

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockUseOptionsSource.mockReturnValue({
    state: { status: "ready", items: DESTINATIONS, hasMore: false },
    refetch: jest.fn(),
  });
});

function renderSetup(values: Record<string, unknown>, onChange = jest.fn()) {
  render(
    <SchemaForm fields={FIELDS} values={values} onChange={onChange} section="setup" />,
  );
  return onChange;
}

describe("setup surface", () => {
  it("always asks for the data, the shape, and where it is headed", () => {
    renderSetup({ destinationMode: "action" });
    expect(screen.getByLabelText(/Data to transform/)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /What shape should the result be/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /How many results/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Extra instructions/)).toBeInTheDocument();
  });

  it("shows the destination picker — not a schema editor — in the default mode", () => {
    renderSetup({ destinationMode: "action" });
    expect(screen.getByRole("combobox", { name: /Destination step/ })).toBeInTheDocument();
    expect(screen.queryByText("Fields to produce")).not.toBeInTheDocument();
  });

  it("loads destinations from the registered option source", () => {
    renderSetup({ destinationMode: "action" });
    expect(mockUseOptionsSource).toHaveBeenCalledWith(
      expect.objectContaining({ source: "ai:destination_actions" }),
    );
  });

  it("shows the chosen destination's friendly label, never the raw key", async () => {
    renderSetup({
      destinationMode: "action",
      destinationAction: "microsoft-outlook:send_email",
    });
    const trigger = screen.getByRole("combobox", { name: /Destination step/ });
    expect(trigger).toHaveTextContent("Microsoft Outlook — Send Email");
    expect(trigger).not.toHaveTextContent("microsoft-outlook:send_email");
  });

  it("shows the schema editor — not the picker — when fields are defined by hand", () => {
    renderSetup({ destinationMode: "custom" });
    expect(screen.getByText("Fields to produce")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add field/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /Destination step/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the advanced knobs out of the setup path", () => {
    renderSetup({ destinationMode: "action" });
    for (const label of [/Maximum results/, /Confidence threshold/, /^Quality/]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
  });
});

describe("mode switching", () => {
  it("clears the destination step when the author switches to defining fields", async () => {
    const user = userEvent.setup();
    const onChange = renderSetup({
      destinationMode: "action",
      destinationAction: "microsoft-outlook:send_email",
    });

    await selectFieldOption(
      user,
      /What shape should the result be/,
      "Define the fields myself",
    );

    expect(onChange).toHaveBeenCalledWith("destinationMode", "custom");
    expect(onChange).toHaveBeenCalledWith("destinationAction", undefined);
  });

  it("clears the hand-defined schema when the author switches back to a step", async () => {
    const user = userEvent.setup();
    const onChange = renderSetup({
      destinationMode: "custom",
      destinationSchema: { fields: [{ name: "full_name", type: "string" }] },
    });

    await selectFieldOption(
      user,
      /What shape should the result be/,
      "Match another step's fields",
    );

    expect(onChange).toHaveBeenCalledWith("destinationMode", "action");
    expect(onChange).toHaveBeenCalledWith("destinationSchema", undefined);
  });

  it("leaves hydrated values alone until the author actually changes the mode", () => {
    const onChange = renderSetup({
      destinationMode: "custom",
      destinationSchema: { fields: [{ name: "full_name", type: "string" }] },
    });
    expect(screen.getByLabelText("Field 1 name")).toHaveValue("full_name");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("advanced surface", () => {
  it("draws only the power-user knobs, seeded with the declared defaults", () => {
    const seeded = deriveDefaultConfig(transformDataMeta);
    expect(seeded).toMatchObject({
      destinationMode: "action",
      outputShape: "rows",
      maxRows: 100,
      confidenceThreshold: 0.7,
      onLowConfidence: "flag",
      strictValidation: true,
      modelQuality: "standard",
    });
    render(
      <SchemaForm
        fields={FIELDS}
        values={seeded}
        onChange={jest.fn()}
        section="advanced"
      />,
    );
    expect(screen.getByLabelText(/Maximum results/)).toHaveValue(100);
    expect(screen.getByRole("combobox", { name: /Quality/ })).toHaveTextContent(
      "Standard (2 credits)",
    );
    expect(screen.queryByLabelText(/Data to transform/)).not.toBeInTheDocument();
  });
});
