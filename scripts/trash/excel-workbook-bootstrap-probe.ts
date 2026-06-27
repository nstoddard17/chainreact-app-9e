/**
 * One-off feasibility probe — can a smoke-owned Excel workbook be bootstrapped by
 * uploading a hand-built minimal .xlsx to OneDrive, then driven via the Excel
 * workbook API? (SMOKE-WRITE-36 candidate: Excel writes.)
 *
 * Builds a minimal OOXML workbook (STORED-method zip, no deps), uploads it to the
 * drive root, then probes: worksheetsList (does Graph OPEN it?) + worksheetsAdd
 * (can we add a sheet?) + worksheetsList again. Cleans up the file at the end.
 *
 * Run: npx tsx scripts/trash/excel-workbook-bootstrap-probe.ts
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsContentUpload } from "@/integrations/microsoft-onedrive/api/driveItemsContentUpload";
import { driveItemsDelete } from "@/integrations/microsoft-onedrive/api/driveItemsDelete";
import { worksheetsList } from "@/integrations/microsoft-excel/api/worksheetsList";
import { worksheetsAdd } from "@/integrations/microsoft-excel/api/worksheetsAdd";

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
    const method = useDeflate ? 8 : 0;
    const body = useDeflate ? comp : e.data;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10); // time
    lh.writeUInt16LE(0x21, 12); // date (1980-ish)
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const localBuf = Buffer.concat(locals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const XML = (s: string): Buffer => Buffer.from(s, "utf8");
function minimalXlsx(): Buffer {
  return buildZip([
    { name: "[Content_Types].xml", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`) },
    { name: "xl/worksheets/sheet1.xml", data: XML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`) },
  ]);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const account = process.env.SMOKE_ACCOUNT_ID!;
  const user = process.env.SMOKE_USER_ID!;
  createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const xlsx = minimalXlsx();
  writeFileSync(resolve(process.cwd(), "scripts/trash/_probe-minimal.xlsx"), xlsx);
  console.log(`minimal xlsx built: ${xlsx.length} bytes, base64 len ${xlsx.toString("base64").length}`);

  const od = await getActiveForExecution(account, "microsoft-onedrive", null, { connectedByUserId: user });
  const xl = await getActiveForExecution(account, "microsoft-excel", null, { connectedByUserId: user });
  if (!od) return void console.log("onedrive not connected — abort.");
  if (!xl) return void console.log("excel not connected — abort.");

  const filename = `crsmoke-probe-${Date.now()}.xlsx`;
  const up = await refreshAndRetry({
    accountId: account, provider: "microsoft-onedrive", providerAccountId: od.providerAccountId,
    apiCall: (t) => driveItemsContentUpload({ accessToken: t, filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: xlsx }),
  });
  const itemId = up.id;
  console.log(`uploaded workbook itemId=${itemId} name=${up.name ?? filename}`);

  try {
    const list1 = await refreshAndRetry({
      accountId: account, provider: "microsoft-excel", providerAccountId: xl.providerAccountId,
      apiCall: (t) => worksheetsList({ accessToken: t, workbookId: itemId }),
    });
    console.log(`OPENS OK — worksheets: ${JSON.stringify(list1.map((s) => s.name))}`);

    const added = await refreshAndRetry({
      accountId: account, provider: "microsoft-excel", providerAccountId: xl.providerAccountId,
      apiCall: (t) => worksheetsAdd({ accessToken: t, workbookId: itemId, name: "crsmoke-ws" }),
    });
    console.log(`worksheetsAdd OK — new sheet name=${(added as { name?: string }).name}`);

    // Re-list a few times over a short window — does the new sheet become visible?
    for (let i = 1; i <= 5; i++) {
      await sleep(1500);
      const ls = await refreshAndRetry({
        accountId: account, provider: "microsoft-excel", providerAccountId: xl.providerAccountId,
        apiCall: (t) => worksheetsList({ accessToken: t, workbookId: itemId }),
      });
      const names = ls.map((s) => s.name);
      console.log(`  re-list #${i} (+${i * 1500}ms): ${JSON.stringify(names)} ${names.includes("crsmoke-ws") ? "<-- VISIBLE" : ""}`);
      if (names.includes("crsmoke-ws")) break;
    }
  } catch (e) {
    console.log(`EXCEL API FAILED: ${(e as Error).message.slice(0, 200)}`);
  } finally {
    // Retry delete with backoff (upload→delete lag / workbook-session lock).
    let cleaned = false;
    for (let i = 1; i <= 6 && !cleaned; i++) {
      try {
        await refreshAndRetry({
          accountId: account, provider: "microsoft-onedrive", providerAccountId: od.providerAccountId,
          apiCall: (t) => driveItemsDelete({ accessToken: t, itemId }),
        });
        cleaned = true;
        console.log(`cleaned up probe workbook on delete attempt ${i}`);
      } catch (e) {
        console.log(`  delete attempt ${i} failed: ${(e as Error).message.slice(0, 70)}`);
        await sleep(2000);
      }
    }
    if (!cleaned) console.log("!! probe workbook NOT cleaned — manual sweep needed");
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
