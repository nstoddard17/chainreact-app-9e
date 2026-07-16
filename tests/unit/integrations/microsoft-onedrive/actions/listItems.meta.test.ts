/**
 * @jest-environment node
 *
 * CONFIG-UX sweep — OneDrive `list_items` meta shape.
 *
 * Pins the `orderBy` text→select conversion: the five curated sort
 * options are stored as the exact OData clause strings the runtime
 * already passes straight through to Graph's `$orderby` query param
 * (`listItems.schema.ts` accepts any string; `driveItemsList` forwards
 * it verbatim), so every option value must round-trip the runtime
 * schema unchanged.
 */

import { microsoftOneDriveListItemsMeta } from "@/integrations/microsoft-onedrive/actions/listItems.meta";
import { ListItemsConfigSchema } from "@/integrations/microsoft-onedrive/actions/listItems.schema";

const field = (name: string) =>
  microsoftOneDriveListItemsMeta.fields.find((f) => f.name === name)!;

describe("OneDrive list_items meta — orderBy select conversion", () => {
  it("orderBy is a select with the five curated Graph sort clauses", () => {
    const orderBy = field("orderBy");
    expect(orderBy.type).toBe("select");
    expect(orderBy.required).toBe(false);
    expect(orderBy.options?.map((o) => o.value)).toEqual([
      "name asc",
      "name desc",
      "lastModifiedDateTime desc",
      "lastModifiedDateTime asc",
      "size desc",
    ]);
  });

  it("every option value round-trips the runtime schema unchanged (wire strings preserved)", () => {
    const orderBy = field("orderBy");
    for (const opt of orderBy.options!) {
      const parsed = ListItemsConfigSchema.parse({ orderBy: opt.value });
      expect(parsed.orderBy).toBe(opt.value);
    }
  });

  it("orderBy description is outcome language (no $orderby / Graph jargon)", () => {
    const orderBy = field("orderBy");
    expect(orderBy.description).not.toMatch(/\$orderby|Graph/i);
  });

  it("top keeps the runtime key with the normalized Max results label", () => {
    const top = field("top");
    expect(top.name).toBe("top");
    expect(top.label).toBe("Max results");
    expect(top.type).toBe("number");
  });
});
