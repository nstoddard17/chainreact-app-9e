/**
 * One-off feasibility probe — can a smoke-owned Excel workbook with an EMBEDDED table be
 * bootstrapped by uploading a hand-built .xlsx, then driven via the Excel TABLE API?
 * (SMOKE-WRITE-42 candidate: add_table_row.)
 *
 * There is no create_table action/API, so the table must ship inside the uploaded
 * workbook. Builds a minimal OOXML workbook with a defined table "SmokeTable" (one column
 * "Col"), uploads it to the drive root, then probes: tablesList (does Graph SEE the table?)
 * + tableColumnsList + tableRowsAdd + tableRowsList. Cleans up the file at the end.
 *
 * DIRECT-API probe — does NOT use the workflow engine / enqueue path (so the durable-queue
 * "queued" enum blocker does not affect it). NOT the live workflow write smoke.
 *
 * Run: npx tsx scripts/trash/excel-table-bootstrap-probe.ts
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsContentUpload } from "@/integrations/microsoft-onedrive/api/driveItemsContentUpload";
import { driveItemsDelete } from "@/integrations/microsoft-onedrive/api/driveItemsDelete";
import { tablesList } from "@/integrations/microsoft-excel/api/tablesList";
import { tableColumnsList } from "@/integrations/microsoft-excel/api/tableColumnsList";
import { tableRowsAdd } from "@/integrations/microsoft-excel/api/tableRowsAdd";
import { tableRowsList } from "@/integrations/microsoft-excel/api/tableRowsList";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[key] = v;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─── minimal CRC32 + zip (STORED + DEFLATE) ──────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
interface ZipEntry { name: string; data: Buffer }
function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const comp = deflateRawSync(e.data);
    const useDeflate = comp.length < e.data.length;
    const body = useDeflate ? comp : e.data;
    const method = useDeflate ? 8 : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(method, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const localBuf = Buffer.concat(locals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}
const XML = (s: string): Buffer => Buffer.from(s, "utf8");

function tableXlsx(): Buffer {
  return buildZip([
    { name: "[Content_Types].xml", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`) },
    { name: "xl/worksheets/sheet1.xml", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:A2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Col</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>seed</t></is></c></row></sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`) },
    { name: "xl/worksheets/_rels/sheet1.xml.rels", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>`) },
    { name: "xl/tables/table1.xml", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="SmokeTable" displayName="SmokeTable" ref="A1:A2" totalsRowShown="0"><autoFilter ref="A1:A2"/><tableColumns count="1"><tableColumn id="1" name="Col"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`) },
  ]);
}

async function main(): Promise<void> {
  loadEnvLocal();
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const account = process.env.SMOKE_ACCOUNT_ID!;
  const user = process.env.SMOKE_USER_ID!;

  const xlsx = tableXlsx();
  writeFileSync(resolve(process.cwd(), "scripts/trash/_probe-table.xlsx"), xlsx);
  console.log(`table xlsx built: ${xlsx.length} bytes, base64 len ${xlsx.toString("base64").length}`);

  const od = await getActiveForExecution(account, "microsoft-onedrive", null, { connectedByUserId: user });
  const xl = await getActiveForExecution(account, "microsoft-excel", null, { connectedByUserId: user });
  if (!od || !xl) return void console.log("onedrive/excel not connected — abort.");

  const filename = `crsmoke-probe-table-${Date.now()}.xlsx`;
  const up = await refreshAndRetry({
    accountId: account, provider: "microsoft-onedrive", providerAccountId: od.providerAccountId,
    apiCall: (t) => driveItemsContentUpload({ accessToken: t, filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: xlsx }),
  });
  const itemId = up.id;
  console.log(`uploaded workbook itemId=${itemId}`);

  try {
    const tables = await refreshAndRetry({ accountId: account, provider: "microsoft-excel", providerAccountId: xl.providerAccountId, apiCall: (t) => tablesList({ accessToken: t, workbookId: itemId }) });
    console.log(`OPENS OK — tables: ${JSON.stringify(tables.map((x) => x.name))}`);
    if (tables.length === 0) { console.log("!! no table recognized — asset invalid"); return; }

    const cols = await refreshAndRetry({ accountId: account, provider: "microsoft-excel", providerAccountId: xl.providerAccountId, apiCall: (t) => tableColumnsList({ accessToken: t, workbookId: itemId, tableName: "SmokeTable" }) });
    console.log(`columns: ${JSON.stringify(cols.map((c) => c.name))}`);

    const added = await refreshAndRetry({ accountId: account, provider: "microsoft-excel", providerAccountId: xl.providerAccountId, apiCall: (t) => tableRowsAdd({ accessToken: t, workbookId: itemId, tableName: "SmokeTable", values: [["crsmoke-probe-trow"]] }) });
    console.log(`tableRowsAdd OK — index=${added.index} values=${JSON.stringify(added.values)}`);

    await sleep(1500);
    const rows = await refreshAndRetry({ accountId: account, provider: "microsoft-excel", providerAccountId: xl.providerAccountId, apiCall: (t) => tableRowsList({ accessToken: t, workbookId: itemId, tableName: "SmokeTable" }) });
    console.log(`tableRowsList — ${rows.length} row(s): ${JSON.stringify(rows.map((r) => r.values))}`);
  } catch (e) {
    console.log(`EXCEL TABLE API FAILED: ${(e as Error).message.slice(0, 220)}`);
  } finally {
    let cleaned = false;
    for (let i = 1; i <= 6 && !cleaned; i++) {
      try {
        await refreshAndRetry({ accountId: account, provider: "microsoft-onedrive", providerAccountId: od.providerAccountId, apiCall: (t) => driveItemsDelete({ accessToken: t, itemId }) });
        cleaned = true; console.log(`cleaned up probe workbook on attempt ${i}`);
      } catch (e) { console.log(`  delete attempt ${i} failed: ${(e as Error).message.slice(0, 60)}`); await sleep(2000); }
    }
    if (!cleaned) console.log("!! probe workbook NOT cleaned — manual sweep needed");
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
