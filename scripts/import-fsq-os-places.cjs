#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
require('tsx/cjs');
require('dotenv/config');
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for a real import.');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { PrismaClient } = require('../generated/prisma/client.ts');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const CRITICAL_FLAGS = new Set(['closed','duplicate','delete','privatevenue','inappropriate','doesnt_exist']);
function parseCsv(text) {
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i], n=text[i+1]; if(quoted){if(c==='"'&&n==='"'){field+='"';i++;} else if(c==='"') quoted=false; else field+=c;} else if(c==='"'&&field===''){quoted=true;} else if(c===','){row.push(field);field='';} else if(c===String.fromCharCode(10)){row.push(field);rows.push(row);row=[];field='';} else if(c!=='\r') field+=c;}
  if(field.length||row.length){row.push(field);rows.push(row);} if(!rows.length)return [];
  const headers=rows.shift().map(x=>x.trim()); return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
function parseFsqCategoryLabels(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.flatMap((value) => parseFsqCategoryLabels(value));
  return String(raw).split(/[|;,]/).map((label) => label.trim()).filter(Boolean);
}
function normalizeCategorySegment(segment) {
  return String(segment ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function classifyFsqCategory(labels) {
  const matches = [];
  for (const label of parseFsqCategoryLabels(labels)) {
    const segments = label.split('>').map(normalizeCategorySegment).filter(Boolean);
    if (segments.includes('night club') || segments.includes('nightclub') || segments.includes('dance club')) matches.push({ category: 'Balada', rank: 4 });
    else if (segments.includes('bar') || segments.includes('cocktail bar') || segments.includes('beer bar') || segments.includes('wine bar') || segments.includes('pub') || segments.includes('lounge')) matches.push({ category: 'Bar', rank: 3 });
    else if (segments.includes('music venue') || segments.includes('concert hall') || segments.includes('live music') || segments.includes('event venue')) matches.push({ category: 'Casa de show', rank: 2 });
    else if (segments.includes('restaurant') || segments.includes('food')) matches.push({ category: 'Restaurante', rank: 1 });
  }
  return matches.sort((a, b) => b.rank - a.rank)[0]?.category ?? null;
}
function normalizeCategory(row) {
  return classifyFsqCategory([row.fsq_category_labels, row.category, row.category_label]);
}
function normalizeRow(row){
  const id=String(row.fsq_place_id||row.fsq_id||row.external_id||'').trim(), name=String(row.name||'').trim(), latitude=Number(row.latitude), longitude=Number(row.longitude);
  const flags=String(row.unresolved_flags||'').toLowerCase().split(/[|;,\s]+/).filter(Boolean), category=normalizeCategory(row);
  const reason=!id?'missing_id':!name?'missing_name':!Number.isFinite(latitude)||latitude<-90||latitude>90?'invalid_latitude':!Number.isFinite(longitude)||longitude<-180||longitude>180?'invalid_longitude':row.date_closed?'closed':flags.some(f=>CRITICAL_FLAGS.has(f))?'critical_flag':!category?'unsupported_category':null;
  return {ok:!reason, reason, value:{name,category,address:String(row.address||'').trim(),latitude,longitude,locality:row.locality||null,region:row.region||null,postcode:row.postcode||null,country:row.country||null,phone:row.tel||null,website:row.website||null,sourceRefreshedAt:row.date_refreshed?new Date(row.date_refreshed):null,externalProvider:'FSQ_OS',externalId:id,source:'IMPORTED',occupancy:0,capacity:null,rating:null,image:null}};
}
function parseArgs(argv){const fileIndex=argv.indexOf('--file'); if(fileIndex<0||!argv[fileIndex+1]) throw new Error('--file is required'); return {file:path.resolve(argv[fileIndex+1]),dryRun:argv.includes('--dry-run')};}
async function main(){let args;try{args=parseArgs(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;return;} if(!fs.existsSync(args.file)){console.error('Input file not found.');process.exitCode=1;return;} const rows=parseCsv(fs.readFileSync(args.file,'utf8')); const report={recordsRead:rows.length,valid:0,eligible:0,invalid:0,closed:0,flagged:0,unsupportedCategory:0,inserted:0,updated:0,skipped:0,failed:0}; const normalized=[]; for(const row of rows){const n=normalizeRow(row); if(!n.ok){report.invalid++; if(n.reason==='closed')report.closed++; else if(n.reason==='critical_flag')report.flagged++; else if(n.reason==='unsupported_category')report.unsupportedCategory++; else report.skipped++; continue;} report.valid++;report.eligible++;normalized.push(n.value);}
  if(args.dryRun){report.wouldProcess=normalized.length; report.wrote=false; console.log(JSON.stringify({mode:"dry-run",...report})); return;}
  const prisma=createPrismaClient(); try{for(let i=0;i<normalized.length;i+=100){const batch=normalized.slice(i,i+100); for(const v of batch){try{const existing=await prisma.venue.findUnique({where:{externalProvider_externalId:{externalProvider:v.externalProvider,externalId:v.externalId}},select:{id:true}}); const data={...v}; if(existing){await prisma.venue.update({where:{id:existing.id},data});report.updated++;}else{await prisma.venue.create({data});report.inserted++;}}catch(e){report.failed++; console.error(`Failed record ${v.externalId}: ${e.message}`);}}}} finally{await prisma.$disconnect();} console.log(JSON.stringify(report));}
if(require.main===module) main();
module.exports={parseCsv,parseFsqCategoryLabels,normalizeCategorySegment,classifyFsqCategory,normalizeCategory,normalizeRow,parseArgs,createPrismaClient};
