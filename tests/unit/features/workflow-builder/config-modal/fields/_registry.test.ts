/**
 * Tests for the field-renderer registry.
 *
 * Per docs/slices/phase-3-builder-ui-plan.md §10 Slice 3.1: every
 * FieldMeta.type variant must resolve to a non-null FieldComponent.
 * TypeScript already enforces this at construction time via the
 * `Record<FieldType, FieldComponent>` map signature; this test catches
 * runtime drift (someone replacing a value with `undefined`).
 */
import {
  FieldTypeSchema,
  type FieldType,
} from "@/contracts/actionMeta";
import {
  FIELD_RENDERERS,
  getFieldRenderer,
} from "@/features/workflow-builder/config-modal/fields/_registry";
import { StringArrayField } from "@/features/workflow-builder/config-modal/fields/StringArrayField";
import { FileRefArrayField } from "@/features/workflow-builder/config-modal/fields/FileRefArrayField";

describe("field-renderer registry", () => {
  it("has exactly one renderer per FieldType variant", () => {
    const types = FieldTypeSchema.options;
    for (const t of types) {
      const Renderer = FIELD_RENDERERS[t];
      expect(Renderer).toBeDefined();
      expect(typeof Renderer).toBe("function");
    }
    // No extra keys.
    expect(Object.keys(FIELD_RENDERERS).sort()).toEqual([...types].sort());
  });

  it("covers all 12 FieldType variants (Slice 3.21 added 'file-array')", () => {
    expect(FieldTypeSchema.options).toHaveLength(12);
    expect(Object.keys(FIELD_RENDERERS)).toHaveLength(12);
  });

  it("FIELD_RENDERERS['string-array'] resolves to StringArrayField", () => {
    expect(FIELD_RENDERERS["string-array"]).toBe(StringArrayField);
  });

  it("FIELD_RENDERERS['file-array'] resolves to FileRefArrayField (Slice 3.21)", () => {
    expect(FIELD_RENDERERS["file-array"]).toBe(FileRefArrayField);
  });

  it("getFieldRenderer returns the same component as FIELD_RENDERERS[type]", () => {
    for (const t of FieldTypeSchema.options as readonly FieldType[]) {
      expect(getFieldRenderer(t)).toBe(FIELD_RENDERERS[t]);
    }
  });

  it("registry object is frozen against runtime mutation", () => {
    expect(Object.isFrozen(FIELD_RENDERERS)).toBe(true);
  });
});
