import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { a1ToGridRange } from "../api/a1ToGridRange";
import { NotFoundError } from "../api/errors";
import { spreadsheetsBatchUpdate } from "../api/spreadsheetsBatchUpdate";
import { spreadsheetsGet } from "../api/spreadsheetsGet";
import {
  FormatRangeConfigSchema,
  type FormatRangeConfig,
} from "./formatRange.schema";

/**
 * Google Sheets format_range action handler (Sheets 2.2 Commit 3).
 *
 * Composes two API calls — both wrapped in `refreshAndRetry` per the
 * auxiliary-call rule in CLAUDE.md §"OAuth 401 handling":
 *   1. `spreadsheets.get` — resolve `sheetName` → numeric `sheetId`.
 *   2. `spreadsheets.batchUpdate` — single `repeatCell` request that
 *      applies the typed `userEnteredFormat` to the `GridRange`
 *      computed from the A1 `range`.
 *
 * Format options follow the accepted plan §10 Decision 2 subset
 * (background color, text color, bold, italic, horizontal alignment,
 * number format). The `fields` mask is built dynamically — only the
 * paths corresponding to set options appear, so Sheets leaves
 * unspecified properties untouched. V1's "apply all fields under
 * userEnteredFormat" approach was overly broad.
 *
 * Borders / conditional formatting / data validation / fontSize /
 * verticalAlignment / wrapStrategy / strikethrough / underline are
 * NOT supported in 2.2 (rejected at schema time).
 */

interface GoogleColor {
  red: number;
  green: number;
  blue: number;
}

/**
 * Hex (`#RRGGBB` or `RRGGBB`) → Google Color object with `red` /
 * `green` / `blue` as floats in [0, 1]. Schema already validates the
 * hex shape; this is a pure transform.
 */
function hexToGoogleColor(hex: string): GoogleColor {
  const cleaned = hex.replace(/^#/, "");
  const value = Number.parseInt(cleaned, 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return {
    red: red / 255,
    green: green / 255,
    blue: blue / 255,
  };
}

interface RepeatCellRequest {
  userEnteredFormat: Record<string, unknown>;
  fields: string[];
}

function buildRepeatCell(config: FormatRangeConfig): RepeatCellRequest {
  const userEnteredFormat: Record<string, unknown> = {};
  const fields: string[] = [];
  const textFormat: Record<string, unknown> = {};

  if (config.backgroundColor !== undefined) {
    userEnteredFormat.backgroundColor = hexToGoogleColor(config.backgroundColor);
    fields.push("userEnteredFormat.backgroundColor");
  }
  if (config.textColor !== undefined) {
    textFormat.foregroundColor = hexToGoogleColor(config.textColor);
    fields.push("userEnteredFormat.textFormat.foregroundColor");
  }
  if (config.bold !== undefined) {
    textFormat.bold = config.bold;
    fields.push("userEnteredFormat.textFormat.bold");
  }
  if (config.italic !== undefined) {
    textFormat.italic = config.italic;
    fields.push("userEnteredFormat.textFormat.italic");
  }
  if (Object.keys(textFormat).length > 0) {
    userEnteredFormat.textFormat = textFormat;
  }
  if (config.horizontalAlignment !== undefined) {
    userEnteredFormat.horizontalAlignment = config.horizontalAlignment;
    fields.push("userEnteredFormat.horizontalAlignment");
  }
  if (config.numberFormat !== undefined) {
    const nf: Record<string, unknown> = { type: config.numberFormat.type };
    if (config.numberFormat.pattern !== undefined) {
      nf.pattern = config.numberFormat.pattern;
    }
    userEnteredFormat.numberFormat = nf;
    fields.push("userEnteredFormat.numberFormat");
  }

  return { userEnteredFormat, fields };
}

export const formatRange: ActionHandler = async (input) => {
  const config: FormatRangeConfig = FormatRangeConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.providerAccountId
      : null;

  const metadata = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-sheets",
    providerAccountId,
    apiCall: (accessToken) =>
      spreadsheetsGet({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        fields: "sheets(properties(sheetId,title))",
      }),
  });

  const sheet = (metadata.sheets ?? []).find(
    (s) => s.properties?.title === config.sheetName,
  );
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new NotFoundError(
      `sheet '${config.sheetName}' on spreadsheet ${config.spreadsheetId}`,
    );
  }

  const gridRange = a1ToGridRange(config.range);
  const { userEnteredFormat, fields } = buildRepeatCell(config);

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-sheets",
    providerAccountId,
    apiCall: (accessToken) =>
      spreadsheetsBatchUpdate({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        requests: [
          {
            repeatCell: {
              range: { sheetId, ...gridRange },
              cell: { userEnteredFormat },
              fields: fields.join(","),
            },
          },
        ],
      }),
  });

  const appliedFormat: Record<string, unknown> = {};
  if (config.backgroundColor !== undefined) {
    appliedFormat.backgroundColor = config.backgroundColor;
  }
  if (config.textColor !== undefined) {
    appliedFormat.textColor = config.textColor;
  }
  if (config.bold !== undefined) {
    appliedFormat.bold = config.bold;
  }
  if (config.italic !== undefined) {
    appliedFormat.italic = config.italic;
  }
  if (config.horizontalAlignment !== undefined) {
    appliedFormat.horizontalAlignment = config.horizontalAlignment;
  }
  if (config.numberFormat !== undefined) {
    appliedFormat.numberFormat = config.numberFormat;
  }

  return {
    output: {
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      sheetId,
      formattedRange: `${config.sheetName}!${config.range}`,
      appliedFormat,
    },
  };
};
