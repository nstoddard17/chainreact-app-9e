import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  formatFields,
  type TypedFieldInput,
} from "@/integrations/_shared/airtable/fields";
import { recordsCreate } from "../api/records";
import { CreateRecordConfigSchema } from "./createRecord.schema";

/**
 * Airtable `create_record` action handler.
 *
 * Coerces typed field inputs into Airtable's wire format via
 * `formatFields` — the 14 supported types coerce cleanly (passthrough
 * for most; date → "YYYY-MM-DD"; dateTime → ISO; multipleRecordLinks
 * strips V1's `recXXX::Display Name` suffix). Deferred types throw
 * `UnsupportedFieldTypeError` BEFORE any Airtable call — workflow
 * authors fail loud at design time rather than silently miscoercing.
 *
 * `typecast` is explicit per Q11 — no silent default.
 *
 * Output shape (downstream variable refs):
 *   { id, fields, createdTime }
 *   - `fields` is the raw response from Airtable (server may have
 *     coerced values when typecast=true; the response reflects the
 *     final stored shape). Workflows can drill into
 *     `{{nodeId.fields.<FieldName>}}`.
 */
export const createRecord: ActionHandler = async (input) => {
  const config = CreateRecordConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.providerAccountId
      : null;

  // Coerce typed field map into Airtable wire-format. Throws
  // UnsupportedFieldTypeError before reaching refreshAndRetry — the
  // unsupported-type error is a config error, not a network error.
  const wireFields = formatFields(
    config.fields as Readonly<Record<string, TypedFieldInput>>,
  );

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "airtable",
    providerAccountId,
    apiCall: (accessToken) =>
      recordsCreate({
        accessToken,
        baseId: config.baseId,
        tableIdOrName: config.tableIdOrName,
        fields: wireFields,
        typecast: config.typecast,
      }),
  });

  return {
    output: {
      id: result.id,
      fields: result.fields,
      createdTime: result.createdTime ?? null,
    },
  };
};
