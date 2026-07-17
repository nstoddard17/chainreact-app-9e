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
 *
 * RESOLVERS-4 adds the second, explicitly-scoped dep channel: `dependsOnRow`,
 * resolved against the SAME ROW's other itemFields (the scope `visibleWhen`
 * already resolves in). Its guards mirror `dependsOn`'s one-for-one, including
 * the load-time throw on a dangling name — the two scopes differ only in WHERE
 * a name must exist, never in how loudly a bad one fails.
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

  it("REJECTS a dependsOn naming a ROW-LOCAL sibling (wrong scope — that's `dependsOnRow`)", () => {
    // The row HAS an `eventType` column, but `dependsOn` resolves against the
    // node's top level — so this must fail loudly rather than silently never
    // resolving. RESOLVERS-4 gave the row-local scope its own key
    // (`dependsOnRow`); using `dependsOn` for it stays an error, so the two
    // scopes can never be confused for one another.
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

/*
 * RESOLVERS-4 — `dependsOnRow`, the ROW-LOCAL dep scope.
 *
 * This is the HubSpot `subscriptions[].propertyName` shape: the value that
 * scopes the picker (`eventType`) lives in the ROW, and different rows watch
 * different object types, so no top-level field can honestly carry it. It is
 * the same scope `visibleWhen.field` has always resolved in.
 */
/** The HubSpot subscriptions row shape: an eventType column + a row-scoped picker. */
const rowScopedList = (subOverrides: Record<string, unknown> = {}): FieldMeta =>
  ({
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
        optionsSource: "hubspot:subscription_properties",
        dependsOnRow: "eventType",
        allowManualEntry: true,
        visibleWhen: { field: "eventType", valueEndsWith: ".propertyChange" },
        ...subOverrides,
      },
    ],
  }) as unknown as FieldMeta;

describe("ObjectListItemFieldSchema — dependsOnRow field-local invariants", () => {
  it("accepts single- and multi-parent dependsOnRow alongside optionsSource", () => {
    for (const dependsOnRow of ["eventType", ["eventType"]]) {
      expect(() =>
        FieldMetaSchema.parse(rowScopedList({ dependsOnRow })),
      ).not.toThrow();
    }
  });

  it("rejects dependsOnRow without optionsSource", () => {
    expect(() =>
      FieldMetaSchema.parse(
        rowScopedList({ optionsSource: undefined, allowManualEntry: undefined }),
      ),
    ).toThrow(/`dependsOnRow` is only valid on sub-fields with `optionsSource`/);
  });

  it("rejects self-referencing and duplicated dependsOnRow", () => {
    expect(() =>
      FieldMetaSchema.parse(rowScopedList({ dependsOnRow: "propertyName" })),
    ).toThrow(/cannot depend on itself/);
    expect(() =>
      FieldMetaSchema.parse(
        rowScopedList({ dependsOnRow: ["eventType", "eventType"] }),
      ),
    ).toThrow(/Duplicate entry in `dependsOnRow`/);
  });

  it("rejects a name declared in BOTH scopes (a parent resolves in exactly one)", () => {
    // Ambiguous by construction: the renderer would not know whether to read
    // `eventType` from the node's config or from the row.
    expect(() =>
      FieldMetaSchema.parse(
        rowScopedList({ dependsOn: "eventType", dependsOnRow: "eventType" }),
      ),
    ).toThrow(/appears in both `dependsOn` and `dependsOnRow`/);
  });
});

describe("meta-level — dependsOnRow must name a real SIBLING sub-field", () => {
  it("accepts a dependsOnRow naming a sibling column (the HubSpot shape)", () => {
    expect(() =>
      ActionMetaSchema.parse(baseAction([rowScopedList()])),
    ).not.toThrow();
  });

  it("REJECTS a dangling dependsOnRow at MODULE LOAD (typo / dead dropdown)", () => {
    // Same loudness as the top-level "depends on unknown field" guard: a typo
    // fails for every importer at import time, not as a silently-empty picker
    // the user has no way to interpret.
    expect(() =>
      ActionMetaSchema.parse(
        baseAction([rowScopedList({ dependsOnRow: "evenType" })]),
      ),
    ).toThrow(/depends on unknown sibling sub-field 'evenType'/);
  });

  it("REJECTS a dependsOnRow naming a TOP-LEVEL field (wrong scope — that's `dependsOn`)", () => {
    // The mirror of the dependsOn-naming-a-row-column rejection above. The node
    // HAS a `workspaceId` field, but dependsOnRow reads the row — so pointing
    // it at a top-level name must fail rather than resolve to nothing.
    expect(() =>
      ActionMetaSchema.parse(
        baseAction([parentField, rowScopedList({ dependsOnRow: "workspaceId" })]),
      ),
    ).toThrow(/depends on unknown sibling sub-field 'workspaceId'/);
  });

  it("applies the same guard to TRIGGER metas (webhook_received is a trigger)", () => {
    expect(() =>
      TriggerMetaSchema.parse(
        baseTrigger([rowScopedList({ dependsOnRow: "nope" })]),
      ),
    ).toThrow(/depends on unknown sibling sub-field 'nope'/);
    expect(() =>
      TriggerMetaSchema.parse(baseTrigger([rowScopedList()])),
    ).not.toThrow();
  });

  it("the two scopes compose on one sub-field (top-level AND row-local parents)", () => {
    expect(() =>
      ActionMetaSchema.parse(
        baseAction([
          parentField,
          rowScopedList({
            dependsOn: "workspaceId",
            dependsOnRow: "eventType",
          }),
        ]),
      ),
    ).not.toThrow();
  });
});
