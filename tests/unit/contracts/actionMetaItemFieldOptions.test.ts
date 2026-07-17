/**
 * RESOLVERS-3 — `itemFields` option-source contract tests.
 *
 * Before this slice `FieldMeta.itemFields` had NO `optionsSource` support at
 * all, so a provider id inside an object-list row had to be hand-typed even
 * where a registered resolver existed. These cover the new sub-field
 * properties (`optionsSource` / `dependsOn` / `allowManualEntry`), their
 * field-local invariants, and — the load-bearing one — the meta-level guard
 * that a sub-field's `dependsOn` names a REAL TOP-LEVEL sibling, for actions
 * AND triggers.
 */
import {
  ActionMetaSchema,
  FieldMetaSchema,
  type ActionMeta,
  type FieldMeta,
} from "@/contracts/actionMeta";
import { TriggerMetaSchema, type TriggerMeta } from "@/contracts/triggerMeta";

const baseAction = (fields: FieldMeta[]): ActionMeta =>
  ({
    key: "native:http_request",
    provider: "native",
    type: "http_request",
    displayName: "HTTP Request",
    description: "Send an HTTP request.",
    category: "http",
    requiresIntegration: false,
    fields,
    outputs: [],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: null,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "low",
  }) as ActionMeta;

const baseTrigger = (fields: FieldMeta[]): TriggerMeta =>
  ({
    key: "native:schedule.fired",
    provider: "native",
    type: "schedule.fired",
    displayName: "Scheduled Trigger",
    description: "Fires on a schedule.",
    category: "scheduling",
    activation: "scheduled",
    requiresIntegration: false,
    fields,
    payloadShape: [],
    displayOrder: null,
  }) as TriggerMeta;

/** An object-list whose sub-field picker depends on a top-level parent. */
const listWithPicker = (
  subOverrides: Record<string, unknown> = {},
): FieldMeta =>
  ({
    name: "parameters",
    label: "Parameters",
    type: "object-list",
    required: true,
    itemFields: [
      {
        name: "name",
        label: "Parameter name",
        type: "text",
        required: true,
        optionsSource: "microsoft-powerbi:semantic_model_parameters",
        allowManualEntry: true,
        ...subOverrides,
      },
    ],
  }) as FieldMeta;

const parentField: FieldMeta = {
  name: "workspaceId",
  label: "Workspace",
  type: "combobox",
  required: true,
  optionsSource: "microsoft-powerbi:workspaces",
} as FieldMeta;

describe("ObjectListItemFieldSchema — optionsSource shape", () => {
  it("accepts optionsSource + allowManualEntry on a text sub-field", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "lineItems",
        label: "Line items",
        type: "object-list",
        required: true,
        itemFields: [
          {
            name: "priceId",
            label: "Price",
            type: "text",
            required: true,
            optionsSource: "stripe:prices",
            allowManualEntry: true,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts optionsSource on a NUMBER sub-field (widget upgrade, value type unchanged)", () => {
    // Shopify line_items[].variant_id is z.number() at runtime — the picker
    // must be expressible without changing the declared value type.
    expect(() =>
      FieldMetaSchema.parse({
        name: "line_items",
        label: "Line items",
        type: "object-list",
        required: true,
        itemFields: [
          {
            name: "variant_id",
            label: "Product variant",
            type: "number",
            required: true,
            optionsSource: "shopify:variants",
            allowManualEntry: true,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts single- and multi-parent dependsOn", () => {
    for (const dependsOn of ["workspaceId", ["workspaceId", "semanticModelId"]]) {
      expect(() =>
        FieldMetaSchema.parse(listWithPicker({ dependsOn })),
      ).not.toThrow();
    }
  });

  it("rejects optionsSource together with static options", () => {
    expect(() =>
      FieldMetaSchema.parse({
        name: "rows",
        label: "Rows",
        type: "object-list",
        required: true,
        itemFields: [
          {
            name: "x",
            label: "X",
            type: "text",
            required: true,
            options: [{ value: "a", label: "A" }],
            optionsSource: "stripe:prices",
          },
        ],
      }),
    ).toThrow(/both `options`.*and `optionsSource`|only valid on `select`/);
  });

  it("rejects optionsSource on select / boolean sub-fields", () => {
    for (const type of ["select", "boolean"]) {
      expect(() =>
        FieldMetaSchema.parse({
          name: "rows",
          label: "Rows",
          type: "object-list",
          required: true,
          itemFields: [
            {
              name: "x",
              label: "X",
              type,
              required: true,
              ...(type === "select" && { options: [{ value: "a", label: "A" }] }),
              optionsSource: "stripe:prices",
            },
          ],
        }),
      ).toThrow(/`optionsSource` is only valid on `text` or `number`/);
    }
  });

  it("rejects allowManualEntry / dependsOn without optionsSource", () => {
    const withoutSource = (extra: Record<string, unknown>) => () =>
      FieldMetaSchema.parse({
        name: "rows",
        label: "Rows",
        type: "object-list",
        required: true,
        itemFields: [
          { name: "x", label: "X", type: "text", required: true, ...extra },
        ],
      });
    expect(withoutSource({ allowManualEntry: true })).toThrow(
      /`allowManualEntry` is only valid on sub-fields with `optionsSource`/,
    );
    expect(withoutSource({ dependsOn: "workspaceId" })).toThrow(
      /`dependsOn` is only valid on sub-fields with `optionsSource`/,
    );
  });

  it("rejects self-referencing and duplicated dependsOn", () => {
    expect(() =>
      FieldMetaSchema.parse(listWithPicker({ dependsOn: ["name"] })),
    ).toThrow(/cannot depend on itself/);
    expect(() =>
      FieldMetaSchema.parse(
        listWithPicker({ dependsOn: ["workspaceId", "workspaceId"] }),
      ),
    ).toThrow(/Duplicate entry in `dependsOn`/);
  });

  it("rejects unknown sub-field keys (still .strict())", () => {
    expect(() =>
      FieldMetaSchema.parse(listWithPicker({ rowLocalDependsOn: "eventType" })),
    ).toThrow();
  });
});

describe("meta-level — sub-field dependsOn must name a real TOP-LEVEL sibling", () => {
  it("accepts a dependsOn naming a top-level sibling", () => {
    expect(() =>
      ActionMetaSchema.parse(
        baseAction([parentField, listWithPicker({ dependsOn: "workspaceId" })]),
      ),
    ).not.toThrow();
  });

  it("REJECTS a dangling dependsOn at load (typo / dead dropdown)", () => {
    expect(() =>
      ActionMetaSchema.parse(
        baseAction([parentField, listWithPicker({ dependsOn: "workspcaeId" })]),
      ),
    ).toThrow(/depends on unknown top-level field 'workspcaeId'/);
  });

  it("REJECTS a dependsOn naming a ROW-LOCAL sibling (unsupported scope)", () => {
    // The row HAS an `eventType` column, but sub-field deps resolve against
    // the node's top level — so this must fail loudly rather than silently
    // never resolving. This is the HubSpot propertyName shape.
    const field = {
      name: "subscriptions",
      label: "Events",
      type: "object-list",
      required: true,
      itemFields: [
        {
          name: "eventType",
          label: "Event",
          type: "select",
          required: true,
          options: [{ value: "deal.propertyChange", label: "Deal changed" }],
        },
        {
          name: "propertyName",
          label: "Property",
          type: "text",
          required: true,
          optionsSource: "hubspot:deal_properties",
          dependsOn: "eventType",
        },
      ],
    } as unknown as FieldMeta;
    expect(() => ActionMetaSchema.parse(baseAction([field]))).toThrow(
      /depends on unknown top-level field 'eventType'/,
    );
  });

  it("REJECTS depending on its own containing object-list field", () => {
    expect(() =>
      ActionMetaSchema.parse(
        baseAction([listWithPicker({ dependsOn: "parameters" })]),
      ),
    ).toThrow(/cannot depend on its own containing field 'parameters'/);
  });

  it("applies the same guard to TRIGGER metas", () => {
    expect(() =>
      TriggerMetaSchema.parse(
        baseTrigger([listWithPicker({ dependsOn: "nope" })]),
      ),
    ).toThrow(/depends on unknown top-level field 'nope'/);
    expect(() =>
      TriggerMetaSchema.parse(
        baseTrigger([parentField, listWithPicker({ dependsOn: "workspaceId" })]),
      ),
    ).not.toThrow();
  });
});
