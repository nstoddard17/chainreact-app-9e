import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { probeWriteConnection } from "@/tests/smoke-actions/writeHarnessDeps";
function loadEnv(){const p=resolve(process.cwd(),".env.local");if(!existsSync(p))return;for(const l of readFileSync(p,"utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(!m)continue;const k=m[1]!;if(process.env[k])continue;let v=m[2]!.trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}}
loadEnv();
(async()=>{
  const account=process.env.SMOKE_ACCOUNT_ID!,user=process.env.SMOKE_USER_ID!;
  const providers=["hubspot","monday","dropbox","microsoft-onedrive","google-drive","mailchimp","google-sheets","microsoft-excel","microsoft-teams","microsoft-onenote"];
  for(const p of providers){
    try{
      const {dbConnected,execUsable}=await probeWriteConnection(account,user,p);
      console.log(`${p.padEnd(20)} dbConnected=${dbConnected} execUsable=${execUsable}`);
    }catch(e){console.log(`${p.padEnd(20)} ERROR ${(e as Error).message.slice(0,60)}`);}
  }
})().then(()=>process.exit(0)).catch(e=>{console.error("FATAL",(e as Error).message);process.exit(1);});
